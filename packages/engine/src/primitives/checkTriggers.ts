import { evaluateCondition } from "../condition";
import { applyDelta } from "../state";
import type { PresetContext, Trigger } from "../types";
import { fireOnStateMutated } from "./hooks";

// Edge-detecting trigger dispatcher. Called by mutateState after every
// state mutation. Compares each trigger's current `when` evaluation
// to its previous evaluation (tracked in state.runtime.activeTriggers)
// and fires `do` ONLY on rising-edge transitions (was false → now
// true). Falling edges (was true → now false) re-arm the trigger
// unless it was declared with `once: true`.
//
// Trigger-fired mutations apply via an internal helper that does NOT
// recursively call checkTriggers — this caps cascade depth at 1.
// Authors who need multi-stage chains can do it through flags: trigger
// A sets `flag: X`, trigger B's `when` includes `flag: X`, the NEXT
// state mutation that touches anything triggers re-check and B fires.
export function checkTriggers(ctx: PresetContext): void {
  const runtime = ctx.state.runtime;

  // Snapshot the currently-active set BEFORE evaluating. Edge detection
  // compares against this. Updates land at the end of the pass.
  const wasActive = new Set(runtime.activeTriggers);
  const newActive: string[] = [];
  const toFire: Trigger[] = [];

  for (const trig of ctx.triggerRegistry) {
    const isActive = evaluateCondition(trig.when, ctx.state).ok;
    if (isActive) {
      newActive.push(trig.id);
      if (wasActive.has(trig.id)) continue; // not a rising edge
      if (trig.once && runtime.firedTriggers.includes(trig.id)) continue;
      toFire.push(trig);
    }
    // Falling edges (was active, no longer) drop out of newActive
    // naturally — the trigger re-arms.
  }

  runtime.activeTriggers = newActive;

  // Fire in declaration order. Each trigger's result applies via
  // applyTriggerResult (sibling helper, NO re-check) to bound cascade.
  for (const trig of toFire) {
    if (trig.once) runtime.firedTriggers.push(trig.id);
    const result = trig.do(ctx);
    applyTriggerResult(ctx, result);
  }
}

// Apply a trigger's ActionResult without invoking checkTriggers again.
// This is the bounding mechanism — trigger-fired mutations show up in
// onStateMutated (source="trigger") for observability but do NOT
// recursively fire more triggers in the same wave.
function applyTriggerResult(
  ctx: PresetContext,
  result: ReturnType<Trigger["do"]>,
): void {
  if (result.deltas) {
    applyDelta(ctx.state, result.deltas);
    fireOnStateMutated(ctx, result.deltas, "trigger");
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
