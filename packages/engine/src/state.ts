import type {
  CharacterDef,
  ComposedState,
  Game,
  Module,
  StateDelta,
} from "./types";
import { baselineModule } from "./modules/baseline";
import { trainingPreset } from "./presets/training";

export function defaultModules(): Module[] {
  return [baselineModule];
}

// Resolve the full module list for a game. Always includes the baseline
// module. Auto-includes the training preset when game.training is
// configured. Then layers user-provided modules on top. User modules
// cannot replace baseline/training presets (matched by id).
export function resolveModules(game: Game): Module[] {
  const builtin: Module[] = [baselineModule];
  if (game.training) builtin.push(trainingPreset);
  const seen = new Set(builtin.map((m) => m.id));
  const game_modules = (game.modules ?? []).filter((m) => !seen.has(m.id));
  return [...builtin, ...game_modules];
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
    if (!mod.initialize) continue;
    const slice = mod.initialize(game);
    if (slice !== undefined) composed[mod.id] = slice;
  }
  return composed;
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
