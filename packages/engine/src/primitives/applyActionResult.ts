import type { ActionResult, PresetContext } from "../types";
import { checkTriggers } from "./checkTriggers";
import { mutateState } from "./mutateState";

// Apply the atomic result of a module-provided ActionHandler:
//   - merge state deltas via mutateState (fires onStateMutated with
//     source "action")
//   - enqueue narrations into state.runtime.pendingNarrations (the
//     drainNarrations primitive yields them one per step across
//     subsequent step() calls)
//   - append customLog entries to state[moduleId].log[]
//
// Handlers are required to be atomic (see ActionHandler doc on the
// Module interface). This function is the engine-side counterpart that
// distributes the atomic result across the right state slices.
export function applyActionResult(
  ctx: PresetContext,
  result: ActionResult,
): void {
  if (result.deltas) {
    mutateState(ctx, result.deltas, "action");
  } else {
    // Handler may have mutated module-private state directly (zone
    // updates, raid sub-state etc.) without returning a StateDelta.
    // Always re-check triggers so a "no deltas" handler can still
    // observe e.g. an HP=0 condition that crossed during its body.
    // Trigger evaluation is cheap and idempotent.
    checkTriggers(ctx);
  }
  if (result.narrations && result.narrations.length > 0) {
    ctx.state.runtime.pendingNarrations.push(...result.narrations);
  }
  if (result.customLog) {
    const { moduleId, entry } = result.customLog;
    const existing = ctx.state[moduleId] as
      | { log?: unknown[] }
      | undefined;
    const slot = existing ?? { log: [] };
    if (!Array.isArray(slot.log)) slot.log = [];
    slot.log.push(entry);
    ctx.state[moduleId] = slot;
  }
}
