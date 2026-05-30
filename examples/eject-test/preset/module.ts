import { mutateState } from "@rpg-harness/engine";
import type {
  Module,
  PresetContext,
  TrainingConfig,
  TrainingState,
} from "@rpg-harness/engine";
import { buildHubSnapshot } from "./hub";
import { sleepHandler } from "./sleepHandler";

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

// Calendar advance: bump slot by `slots`; roll into next day with
// per-day decay (the configured `decayStatId` shifts by decayPerDay
// every rollover). Uses mutateState so the per-day decay surfaces via
// onStateMutated with source="decay".
function advanceCalendar(ctx: PresetContext, slots: number): void {
  const { state, game } = ctx;
  if (!state.training || !game.training) return;
  const cfg = game.training;
  const t = state.training;
  t.slot += slots;
  while (t.slot >= cfg.slotsPerDay) {
    t.slot -= cfg.slotsPerDay;
    t.day += 1;
    if (cfg.decayPerDay !== 0 && cfg.decayStatId) {
      mutateState(
        ctx,
        { stats: { [cfg.decayStatId]: cfg.decayPerDay } },
        "decay",
      );
    }
  }
}

// The training preset Module — registers all the hooks the training
// run loop relies on. Note: the run LOOP itself lives in run.ts; this
// module object only carries the hook implementations the engine
// dispatches into.
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
  // After every action completes, bump the calendar by action.cost.
  // Scripts are dispatched as 1-slot actions by the training run loop.
  onActionComplete: (ctx, action, _result) => {
    advanceCalendar(ctx, action.cost);
  },
  // First-wins: provide the hub Output. The vn preset's loop never
  // calls fireOnHubBuild, so this only fires when running under the
  // training preset.
  onHubBuild: (ctx) => {
    const { state, game } = ctx;
    if (!state.training || !game.training) return undefined;
    return buildHubSnapshot(state, game);
  },
};
