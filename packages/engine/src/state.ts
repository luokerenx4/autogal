import type {
  CharacterDef,
  ComposedState,
  Game,
  Module,
  StateDelta,
  TrainingConfig,
  TrainingState,
} from "./types";
import { baselineModule } from "./modules/baseline";

export function defaultModules(): Module[] {
  return [baselineModule];
}

// Always layer game-provided modules on top of the built-in defaults
// (which include the baseline module). Game modules can register
// action handlers and lifecycle hooks but cannot replace baseline state.
export function resolveModules(game: Game): Module[] {
  const defaults = defaultModules();
  const game_modules = game.modules ?? [];
  const seen = new Set(defaults.map((m) => m.id));
  return [...defaults, ...game_modules.filter((m) => !seen.has(m.id))];
}

export function createInitialState(game: Game): ComposedState;
export function createInitialState(characters: CharacterDef[]): ComposedState;
export function createInitialState(
  arg: Game | CharacterDef[],
): ComposedState {
  const game: Game = Array.isArray(arg)
    ? { title: "", characters: arg, scripts: [] }
    : arg;
  const modules = resolveModules(game);
  const composed: ComposedState = { baseline: undefined as never };
  for (const mod of modules) {
    if (mod.initialize) {
      composed[mod.id] = mod.initialize(game);
    }
  }
  if (game.training) {
    composed.training = createTrainingState(game.training);
  }
  return composed;
}

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
    pendingNarrations: [],
  };
}

export function applyDelta(state: ComposedState, delta: StateDelta): void {
  if (delta.affection) {
    for (const [charId, change] of Object.entries(delta.affection)) {
      const c = state.baseline.characters[charId];
      if (c) c.affection += change;
    }
  }
  if (delta.flags) {
    for (const [name, value] of Object.entries(delta.flags)) {
      const current = state.baseline.flags[name];
      if (typeof current === "number" && typeof value === "number") {
        state.baseline.flags[name] = current + value;
      } else {
        state.baseline.flags[name] = value;
      }
    }
  }
  if (delta.stats && state.training) {
    for (const [name, change] of Object.entries(delta.stats)) {
      const current = state.training.stats[name] ?? 0;
      const max = state.training.statMax[name] ?? Number.MAX_SAFE_INTEGER;
      state.training.stats[name] = clamp(current + change, 0, max);
    }
  }
  if (delta.statMax && state.training) {
    for (const [name, change] of Object.entries(delta.statMax)) {
      const current = state.training.statMax[name] ?? 0;
      state.training.statMax[name] = current + change;
    }
  }
}

export function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function cloneState(state: ComposedState): ComposedState {
  return structuredClone(state);
}

export function hydrateState(serialized: string): ComposedState {
  return JSON.parse(serialized) as ComposedState;
}
