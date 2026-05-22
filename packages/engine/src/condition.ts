import type { ComposedState, Condition } from "./types";

export function evaluateCondition(
  cond: Condition,
  state: ComposedState,
): boolean {
  if ("all" in cond) {
    return cond.all.every((c) => evaluateCondition(c, state));
  }
  if ("any" in cond) {
    return cond.any.some((c) => evaluateCondition(c, state));
  }
  if ("not" in cond) {
    return !evaluateCondition(cond.not, state);
  }
  if ("scriptCompleted" in cond) {
    return state.baseline.completedScripts.includes(cond.scriptCompleted);
  }
  if ("affection" in cond) {
    const c = state.baseline.characters[cond.affection.character];
    if (!c) return false;
    return rangeMatch(c.affection, cond.affection);
  }
  if ("switch" in cond) {
    const v = state.baseline.switches[cond.switch.name];
    const { eq } = cond.switch;
    if (eq !== undefined) return v === eq;
    return v === true;
  }
  if ("variable" in cond) {
    const v = state.baseline.variables[cond.variable.name];
    const { eq, min, max } = cond.variable;
    if (eq !== undefined) return v === eq;
    if (typeof v !== "number") return false;
    if (min !== undefined && v < min) return false;
    if (max !== undefined && v > max) return false;
    return true;
  }
  if ("stat" in cond) {
    if (!state.training) return false;
    const v = state.training.stats[cond.stat.name];
    if (v === undefined) return false;
    return rangeMatch(v, cond.stat);
  }
  if ("inventory" in cond) {
    const count = state.baseline.inventory[cond.inventory.itemId] ?? 0;
    return rangeMatch(count, cond.inventory);
  }
  if ("weaponPower" in cond) {
    const w = state.baseline.weapons[cond.weaponPower.weaponId];
    if (!w) return false;
    return rangeMatch(w.power, cond.weaponPower);
  }
  if ("knowsSkill" in cond) {
    return state.baseline.knownSkills.includes(cond.knowsSkill);
  }
  if ("day" in cond) {
    if (!state.training) return false;
    return rangeMatch(state.training.day, cond.day);
  }
  if ("slot" in cond) {
    if (!state.training) return false;
    return rangeMatch(state.training.slot, cond.slot);
  }
  return false;
}

interface RangeQuery {
  min?: number;
  max?: number;
  eq?: number;
}

function rangeMatch(value: number, q: RangeQuery): boolean {
  if (q.min !== undefined && value < q.min) return false;
  if (q.max !== undefined && value > q.max) return false;
  if (q.eq !== undefined && value !== q.eq) return false;
  return true;
}
