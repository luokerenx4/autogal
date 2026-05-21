import { evaluateCondition } from "../condition";
import { applyDelta } from "../state";
import type { Action, Input, Output, PresetContext } from "../types";
import { applyActionResult } from "./applyActionResult";

// Dispatch a hub-menu activity by its full id (e.g. "script:001_arrival",
// "action:hunt"). Handles the two activity prefixes:
//   - "script:" → set baseline.currentScriptId so the run loop's
//     subsequent iteration enters that script
//   - "action:" → resolve to a registered Action, check requires(),
//     dispatch via the action handler registry (kind-based) or just
//     apply action.effects if no handler is registered
//
// Returns "ok" on completion, "quit" if a yielded sub-flow received
// a quit input. Today no action body yields, but the return type
// allows future preset modules to register multi-yield handlers if
// they own the resumption state themselves.
export async function* dispatchActivity(
  ctx: PresetContext,
  activityId: string,
): AsyncGenerator<Output, "ok" | "quit", Input> {
  if (activityId.startsWith("script:")) {
    const scriptId = activityId.slice("script:".length);
    if (!ctx.scriptMap.has(scriptId)) return "ok";
    if (ctx.state.baseline.completedScripts.includes(scriptId)) return "ok";
    ctx.state.baseline.currentScriptId = scriptId;
    ctx.state.baseline.beatIndex = 0;
    return "ok";
  }
  if (activityId.startsWith("action:")) {
    const actionId = activityId.slice("action:".length);
    const action = ctx.actionMap.get(actionId);
    if (!action) return "ok";
    const available =
      action.requires === undefined ||
      evaluateCondition(action.requires, ctx.state);
    if (!available) return "ok";
    return yield* runAction(ctx, action);
  }
  return "ok";
}

// Inner action runner. Dispatches via the action handler registry
// (set up at engine construction from all modules' actionHandlers).
// Falls back to applying action.effects directly for kindless actions.
// After the action body, every module's onActionComplete hook fires —
// the training preset uses this to advance the calendar.
async function* runAction(
  ctx: PresetContext,
  action: Action,
): AsyncGenerator<Output, "ok" | "quit", Input> {
  const handler = action.kind
    ? ctx.actionHandlerRegistry[action.kind]
    : undefined;
  if (handler) {
    applyActionResult(
      ctx,
      handler({
        state: ctx.state,
        action,
        game: ctx.game,
        rng: ctx.rng,
      }),
    );
  } else if (action.effects) {
    applyDelta(ctx.state, action.effects);
  }
  // Notify every module that an action completed. The training preset
  // uses this hook (named advanceAfterAction today, renamed to
  // onActionComplete in C2) to advance slot/day and apply per-day decay.
  for (const mod of ctx.modules) {
    mod.advanceAfterAction?.(ctx.state, ctx.game, action);
  }
  return "ok";
}
