import type {
  CharacterDef,
  ComposedState,
  Game,
  Module,
  StateDelta,
} from "./types";
import { baselineModule } from "./modules/baseline";

export function defaultModules(): Module[] {
  return [baselineModule];
}

export function resolveModules(game: Game): Module[] {
  if (game.modules && game.modules.length > 0) return game.modules;
  return defaultModules();
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
    composed[mod.id] = mod.initialize(game);
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
}

export function cloneState(state: ComposedState): ComposedState {
  return structuredClone(state);
}

export function hydrateState(serialized: string): ComposedState {
  return JSON.parse(serialized) as ComposedState;
}
