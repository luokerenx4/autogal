import { applyDelta } from "../state";
import type { PresetContext, StateDelta, StateMutationSource } from "../types";
import { checkTriggers } from "./checkTriggers";
import { fireOnStateMutated } from "./hooks";

// Apply a StateDelta + fire the onStateMutated hook with the given
// source + run reactive-trigger edge detection. All primitives and
// presets that mutate state should go through this (rather than
// calling applyDelta directly) so subscriber modules see every
// mutation tagged with where it came from AND triggers fire on
// rising-edge state transitions.
//
// applyDelta itself remains exported for hot paths where the source
// is genuinely unknown (e.g. external state restoration), but the
// preferred path is mutateState.
export function mutateState(
  ctx: PresetContext,
  delta: StateDelta,
  source: StateMutationSource,
): void {
  applyDelta(ctx.state, delta, ctx.game);
  fireOnStateMutated(ctx, delta, source);
  checkTriggers(ctx);
}
