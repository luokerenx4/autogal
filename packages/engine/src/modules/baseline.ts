import type {
  BaselineState,
  CharacterDef,
  CharacterState,
  FlagValue,
  Game,
  Module,
} from "../types";

export const BASELINE_NAMESPACE = "baseline";

export function createBaselineState(characters: CharacterDef[]): BaselineState {
  const charMap: Record<string, CharacterState> = {};
  for (const c of characters) {
    charMap[c.id] = {
      affection: c.defaultAffection ?? 0,
      custom: {},
    };
  }
  return {
    characters: charMap,
    flags: {},
    completedScripts: [],
    currentScriptId: null,
    beatIndex: 0,
  };
}

export const baselineModule: Module = {
  id: BASELINE_NAMESPACE,
  version: "0.1",
  initialize(game: Game): BaselineState {
    return createBaselineState(game.characters);
  },
};

export type { BaselineState, FlagValue };
