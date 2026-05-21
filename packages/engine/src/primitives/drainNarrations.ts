import type { Input, Output, PresetContext } from "../types";
import { fireOnNarrationDrain } from "./hooks";

// Drain the pending narration queue one at a time. Each shift happens
// AFTER the yield — so peek() (which calls .next() once then
// runner.return()s) sees the next narration without consuming it, and
// step() (.next() twice) consumes exactly one. This is how combat-via-
// step works post-PR #1: combat handlers push a batch of narrations
// into state.runtime.pendingNarrations and the run loop drains them
// across subsequent step() calls.
//
// Fires onNarrationDrain (observer) after each shift, so modules can
// observe / log narration playback.
export async function* drainNarrations(
  ctx: PresetContext,
): AsyncGenerator<Output, void, Input> {
  const q = ctx.state.runtime.pendingNarrations;
  while (q.length > 0) {
    const text = q[0]!;
    const input = yield { type: "narration", text };
    if (input.type === "quit") return;
    q.shift();
    fireOnNarrationDrain(ctx, text);
  }
}
