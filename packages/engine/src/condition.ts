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
    const { min, max, eq } = cond.affection;
    if (min !== undefined && c.affection < min) return false;
    if (max !== undefined && c.affection > max) return false;
    if (eq !== undefined && c.affection !== eq) return false;
    return true;
  }
  if ("flag" in cond) {
    const v = state.baseline.flags[cond.flag.name];
    const { eq, min, max } = cond.flag;
    if (eq !== undefined) return v === eq;
    if (typeof v !== "number") return false;
    if (min !== undefined && v < min) return false;
    if (max !== undefined && v > max) return false;
    return true;
  }
  return false;
}
