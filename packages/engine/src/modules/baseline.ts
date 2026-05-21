import type {
  ActionHandler,
  BaselineState,
  CharacterDef,
  CharacterState,
  FlagValue,
  Game,
  Module,
  StateDelta,
  WeaponDef,
  WeaponState,
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

// useSkill action handler. Validates ownership (knownSkills), then
// applies both cost and effects in a single combined delta — atomic
// so triggers see both at once.
const useSkillHandler: ActionHandler = ({ state, action, game }) => {
  if (!action.skillId) return {};
  const skillDef = (game.skills ?? []).find((s) => s.id === action.skillId);
  if (!skillDef) return {};
  if (!state.baseline.knownSkills.includes(action.skillId)) return {};

  // Merge cost + effects. Both can touch any StateDelta field; later
  // entries (effects) override earlier (cost) on simple keys. For
  // stats/affection/inventory/weapons (which are records summed
  // additively), we sum field-by-field.
  const deltas: StateDelta = {};
  if (skillDef.cost) mergeDelta(deltas, skillDef.cost);
  if (skillDef.effects) mergeDelta(deltas, skillDef.effects);
  return { deltas };
};

// Merge `src` into `dst` — additive on numeric record fields,
// last-write-wins on flag values. Used by useSkill to combine the
// skill's cost + effects into one atomic delta.
function mergeDelta(dst: StateDelta, src: StateDelta): void {
  if (src.affection) {
    dst.affection = dst.affection ?? {};
    for (const [k, v] of Object.entries(src.affection)) {
      dst.affection[k] = (dst.affection[k] ?? 0) + v;
    }
  }
  if (src.stats) {
    dst.stats = dst.stats ?? {};
    for (const [k, v] of Object.entries(src.stats)) {
      dst.stats[k] = (dst.stats[k] ?? 0) + v;
    }
  }
  if (src.statMax) {
    dst.statMax = dst.statMax ?? {};
    for (const [k, v] of Object.entries(src.statMax)) {
      dst.statMax[k] = (dst.statMax[k] ?? 0) + v;
    }
  }
  if (src.flags) {
    dst.flags = { ...(dst.flags ?? {}), ...src.flags };
  }
  if (src.inventory) {
    dst.inventory = dst.inventory ?? {};
    for (const [k, v] of Object.entries(src.inventory)) {
      dst.inventory[k] = (dst.inventory[k] ?? 0) + v;
    }
  }
  if (src.weapons) {
    dst.weapons = dst.weapons ?? {};
    for (const [k, v] of Object.entries(src.weapons)) {
      const cur = dst.weapons[k] ?? {};
      dst.weapons[k] = {
        power: (cur.power ?? 0) + (v.power ?? 0),
      };
    }
  }
  if (src.skills) {
    dst.skills = dst.skills ?? {};
    if (src.skills.learn) {
      dst.skills.learn = [...(dst.skills.learn ?? []), ...src.skills.learn];
    }
    if (src.skills.forget) {
      dst.skills.forget = [
        ...(dst.skills.forget ?? []),
        ...src.skills.forget,
      ];
    }
  }
}

export function createBaselineState(
  characters: CharacterDef[],
  weapons: WeaponDef[] = [],
): BaselineState {
  const charMap: Record<string, CharacterState> = {};
  for (const c of characters) {
    charMap[c.id] = {
      affection: c.defaultAffection ?? 0,
      custom: {},
    };
  }
  const weaponMap: Record<string, WeaponState> = {};
  for (const w of weapons) {
    weaponMap[w.id] = { power: w.basePower };
  }
  // Auto-equip the only declared weapon. Multi-weapon games leave
  // equippedWeaponId null and equip via the equipWeapon primitive.
  const equippedWeaponId = weapons.length === 1 ? weapons[0]!.id : null;
  return {
    characters: charMap,
    flags: {},
    completedScripts: [],
    currentScriptId: null,
    beatIndex: 0,
    inventory: {},
    weapons: weaponMap,
    equippedWeaponId,
    knownSkills: [],
  };
}

export const baselineModule: Module = {
  id: BASELINE_NAMESPACE,
  version: "0.1",
  initialize(game: Game): BaselineState {
    return createBaselineState(game.characters, game.weapons ?? []);
  },
  actionHandlers: {
    useItem: useItemHandler,
    useSkill: useSkillHandler,
  },
};

export type { BaselineState, FlagValue };
