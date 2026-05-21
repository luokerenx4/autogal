// Training-mode preset. Implements the day/slot/stats/hub game-loop
// that 妖刀さくら抄 and similar era-style games use. Shipped as a
// builtin module: when game.yaml declares a `training:` config block,
// state.ts auto-includes this module alongside the user's own modules.
//
// What this preset owns:
//   - state.training (created by initialize, advanced after each action)
//   - the hub Output (buildHubOutput renders the activity menu)
//   - the "sleep" action kind (restores physical-family stats to max)
//   - day/slot/decay rollover (advanceAfterAction)
//
// What it does NOT own:
//   - the script runner (engine main loop)
//   - end conditions check (engine main loop)
//   - any specific stat names, combat formulas, or game content
//
// A game's combat or other custom action kinds register their own
// handlers via additional modules in game.yaml's `modules:` list.

import { evaluateCondition } from "../condition";
import { mutateState } from "../primitives/mutateState";
import type {
  ActionHandler,
  ComposedState,
  Game,
  HubActivity,
  HubSnapshot,
  Module,
  Output,
  PresetContext,
  StateDelta,
  TrainingConfig,
  TrainingState,
} from "../types";

export const TRAINING_NAMESPACE = "training";

export function createTrainingState(config: TrainingConfig): TrainingState {
  const stats: Record<string, number> = {};
  const statMax: Record<string, number> = {};
  for (const s of config.stats) {
    stats[s.id] = s.start;
    statMax[s.id] = s.max;
  }
  return {
    day: config.startDay,
    slot: 0,
    stats,
    statMax,
  };
}

function isExplicitlyEnding(game: Game, scriptId: string): boolean {
  if (!game.training) return false;
  return game.training.endConditions.some((ec) => ec.goto === scriptId);
}

function formatEffectsHint(effects: StateDelta | undefined): string | undefined {
  if (!effects) return undefined;
  const parts: string[] = [];
  if (effects.affection) {
    for (const [k, v] of Object.entries(effects.affection)) {
      parts.push(`${k}${v >= 0 ? "+" : ""}${v}`);
    }
  }
  if (effects.stats) {
    for (const [k, v] of Object.entries(effects.stats)) {
      parts.push(`${k}${v >= 0 ? "+" : ""}${v}`);
    }
  }
  if (effects.flags) {
    for (const [k, v] of Object.entries(effects.flags)) {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function buildHubSnapshot(state: ComposedState, game: Game): Output {
  const cfg = game.training!;
  const t = state.training!;
  const slotName = cfg.slotNames[t.slot] ?? `slot ${t.slot}`;
  const isNight = t.slot === cfg.slotsPerDay - 1;

  const activities: HubActivity[] = [];

  for (const s of game.scripts) {
    if (state.baseline.completedScripts.includes(s.id)) continue;
    const available =
      s.requires === undefined || evaluateCondition(s.requires, state);
    if (!available) continue;
    if (isExplicitlyEnding(game, s.id)) continue;
    activities.push({
      id: `script:${s.id}`,
      kind: "script",
      title: `📖 ${s.title}`,
      cost: 1,
      available: true,
    });
  }

  for (const a of game.actions ?? []) {
    if (a.slot === "day" && isNight) continue;
    if (a.slot === "night" && !isNight) continue;
    const available =
      a.requires === undefined || evaluateCondition(a.requires, state);
    activities.push({
      id: `action:${a.id}`,
      kind: "action",
      title: a.title,
      description: a.description,
      category: a.category,
      cost: a.cost,
      effectsHint: formatEffectsHint(a.effects),
      available,
      lockedReason: available ? undefined : "条件未满足",
    });
  }

  const snapshot: HubSnapshot = {
    day: t.day,
    maxDay: cfg.maxDay,
    slot: t.slot,
    slotName,
    slotsPerDay: cfg.slotsPerDay,
    stats: cfg.stats.map((sd) => ({
      id: sd.id,
      name: sd.name,
      value: t.stats[sd.id] ?? 0,
      min: sd.min,
      max: t.statMax[sd.id] ?? sd.max,
      ...(sd.thresholds ? { thresholds: sd.thresholds } : {}),
    })),
    affections: game.characters.map((c) => ({
      id: c.id,
      name: c.name,
      value: state.baseline.characters[c.id]?.affection ?? 0,
    })),
    activities,
  };

  return { type: "hubMenu", snapshot };
}

// Calendar advance: bump slot by `slots`; roll into next day with
// per-day decay (the configured `decayStatId` shifts by decayPerDay
// every rollover). Uses mutateState so the per-day decay surfaces via
// onStateMutated with source="decay".
function advanceCalendar(
  ctx: PresetContext,
  slots: number,
): void {
  const { state, game } = ctx;
  if (!state.training || !game.training) return;
  const cfg = game.training;
  const t = state.training;
  t.slot += slots;
  while (t.slot >= cfg.slotsPerDay) {
    t.slot -= cfg.slotsPerDay;
    t.day += 1;
    if (cfg.decayPerDay !== 0 && cfg.decayStatId) {
      mutateState(ctx, { stats: { [cfg.decayStatId]: cfg.decayPerDay } }, "decay");
    }
  }
}

// "Sleep" action kind: restore physical-family stats to their max,
// apply the action's own effects (mental/spectral deltas from yaml).
// Returns a consolidated delta rather than mutating state directly,
// so onStateMutated (C2) fires uniformly through applyActionResult.
const sleepHandler: ActionHandler = ({ state, action }) => {
  const t = state.training;
  if (!t) return {};

  const stats: Record<string, number> = {};
  // Pass through non-physical-family stat effects from action.effects.
  for (const [k, v] of Object.entries(action.effects?.stats ?? {})) {
    if (k === "physical" || k === "energy" || k === "stamina") continue;
    stats[k] = v;
  }
  // Physical-family stats: delta-to-max (sleep restores regardless of
  // action.effects intent for these slots).
  for (const statId of Object.keys(t.stats)) {
    if (statId === "physical" || statId === "energy" || statId === "stamina") {
      const max = t.statMax[statId] ?? t.stats[statId]!;
      const cur = t.stats[statId] ?? 0;
      if (max > cur) stats[statId] = max - cur;
    }
  }

  return {
    deltas: {
      ...(action.effects ?? {}),
      stats,
    },
  };
};

export const trainingPreset: Module = {
  id: TRAINING_NAMESPACE,
  version: "1.0.0",
  initialize: (game) => {
    if (!game.training) return undefined;
    return createTrainingState(game.training);
  },
  actionHandlers: {
    sleep: sleepHandler,
  },
  // Renamed from advanceAfterAction (PR #2) — same semantics, new
  // unified hook name from C2.
  onActionComplete: (ctx, action, _result) => {
    advanceCalendar(ctx, action.cost);
  },
  // Renamed from buildHubOutput (PR #2). First-wins: this preset
  // claims the hub when game.training is configured.
  onHubBuild: (ctx) => {
    const { state, game } = ctx;
    if (!state.training || !game.training) return undefined;
    return buildHubSnapshot(state, game);
  },
};
