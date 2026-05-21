import type {
  ActionHandler,
  BaselineState,
  CharacterDef,
  CharacterState,
  FlagValue,
  Game,
  Module,
  StateDelta,
} from "../types";

export const BASELINE_NAMESPACE = "baseline";

// Default useItem action handler. Available on every game (baseline
// module is built-in). When player picks an action with
// `kind: "useItem", itemId: <id>`:
//   1. Look up the item in game.items
//   2. Verify the player owns >= 1
//   3. Return an ActionResult whose deltas combine the item's effects
//      with a `-1` inventory entry — applied atomically by
//      applyActionResult so onStateMutated fires once with both
//      changes visible
//
// No-ops silently if the item is missing or unowned. Author-side
// `requires:` on the action is the standard way to ensure the action
// only shows when usable.
const useItemHandler: ActionHandler = ({ state, action, game }) => {
  if (!action.itemId) return {};
  const itemDef = (game.items ?? []).find((i) => i.id === action.itemId);
  if (!itemDef) return {};
  const have = state.baseline.inventory[action.itemId] ?? 0;
  if (have < 1) return {};

  const deltas: StateDelta = {
    inventory: { [action.itemId]: -1 },
  };
  if (itemDef.effects) {
    if (itemDef.effects.affection) deltas.affection = itemDef.effects.affection;
    if (itemDef.effects.flags) deltas.flags = itemDef.effects.flags;
    if (itemDef.effects.stats) deltas.stats = itemDef.effects.stats;
    if (itemDef.effects.statMax) deltas.statMax = itemDef.effects.statMax;
  }
  return { deltas };
};

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
    inventory: {},
  };
}

export const baselineModule: Module = {
  id: BASELINE_NAMESPACE,
  version: "0.1",
  initialize(game: Game): BaselineState {
    return createBaselineState(game.characters);
  },
  actionHandlers: {
    useItem: useItemHandler,
  },
};

export type { BaselineState, FlagValue };
