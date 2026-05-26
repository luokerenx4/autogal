import { evaluateCondition } from "../condition";
import type { EndConditionSpec, PresetContext } from "../types";

// Returns the first endCondition whose `when` evaluates true under the
// current state, or null if none. Today only training-mode games declare
// endConditions (via game.training.endConditions). Non-training presets
// short-circuit to null.
export function checkEndConditions(
  ctx: PresetContext,
): EndConditionSpec | null {
  if (!ctx.game.training) return null;
  for (const ec of ctx.game.training.endConditions) {
    if (evaluateCondition(ec.when, ctx.state).ok) return ec;
  }
  return null;
}
