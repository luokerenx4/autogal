import { evaluateCondition } from "../condition";
import type {
  Action,
  ActionResult,
  Input,
  Output,
  PresetContext,
} from "../types";
import { applyActionResult } from "./applyActionResult";
import {
  fireOnActionComplete,
  fireOnActionDispatch,
  fireOnScriptSelect,
} from "./hooks";
import { mutateState } from "./mutateState";

// Dispatch a hub-menu activity by its full id (e.g. "script:001_arrival",
// "action:hunt"). Handles the two activity prefixes:
//   - "script:" → fire onScriptSelect (modules may redirect), then set
//     baseline.currentScriptId so the run loop enters that script
//   - "action:" → resolve to a registered Action, check requires(),
//     fire onActionDispatch (modules may substitute or cancel), then
//     dispatch via the action handler registry, then fire
//     onActionComplete
export async function* dispatchActivity(
  ctx: PresetContext,
  activityId: string,
): AsyncGenerator<Output, "ok" | "quit", Input> {
  if (activityId.startsWith("script:")) {
    const requested = activityId.slice("script:".length);
    const scriptId = fireOnScriptSelect(ctx, requested);
    if (!ctx.scriptMap.has(scriptId)) return "ok";
    if (ctx.state.baseline.scripts[scriptId]?.completed === true) return "ok";
    ctx.state.baseline.currentScriptId = scriptId;
    ctx.state.baseline.beatIndex = 0;
    return "ok";
  }
  if (activityId.startsWith("action:")) {
    const actionId = activityId.slice("action:".length);
    const original = ctx.actionMap.get(actionId);
    if (!original) return "ok";
    const available =
      original.requires === undefined ||
      evaluateCondition(original.requires, ctx.state);
    if (!available) return "ok";
    const dispatched = fireOnActionDispatch(ctx, original);
    if (dispatched === "cancel") return "ok";
    return yield* runAction(ctx, dispatched);
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
  let result: ActionResult | undefined;
  if (handler) {
    result = handler({
      state: ctx.state,
      action,
      game: ctx.game,
      rng: ctx.rng,
    });
    applyActionResult(ctx, result);
  } else if (action.effects) {
    mutateState(ctx, action.effects, "action");
  }
  fireOnActionComplete(ctx, action, result);
  return "ok";
}
