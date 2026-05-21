// Pure VN preset. Game loop for visual-novel-shaped games: no hub, no
// calendar, just a script-by-script flow. After each script finishes,
// the engine yields a `scriptComplete` Output listing the next available
// scripts; the player picks one and the engine enters it.
//
// This is the file an AI / human author copies (via
// `autogal init --preset vn --eject`) when they want to write their
// own VN loop semantics — e.g. add a save-point ritual between
// scripts, gate progression by some flag, or insert a custom Output.
// All engine primitives this file uses (drainNarrations, runScript,
// fireOn*) are exported from `@autogal/engine` so an ejected copy of
// this file works unchanged outside the engine source tree.

import { evaluateCondition } from "../../condition";
import {
  drainNarrations,
  fireOnScriptComplete,
  fireOnScriptSelect,
  fireOnSessionStart,
  runScript,
} from "../../primitives";
import type {
  Input,
  Output,
  PresetContext,
  ScriptInfo,
} from "../../types";

// Default export is the RunFunction itself — this is what the CLI
// loader picks up when game.yaml says `preset: ./preset/run.ts`
// (the --eject scenario). Named export is kept for engine-internal
// consumers (state.ts resolveRunFn).
export default vnRun;

export async function* vnRun(
  ctx: PresetContext,
): AsyncGenerator<Output, void, Input> {
  fireOnSessionStart(ctx);

  while (true) {
    yield* drainNarrations(ctx);

    // Run the current script if one is set.
    if (ctx.state.baseline.currentScriptId !== null) {
      const script = ctx.scriptMap.get(ctx.state.baseline.currentScriptId);
      if (!script) {
        throw new Error(
          `vnRun: current script not found: ${ctx.state.baseline.currentScriptId}`,
        );
      }
      const finished = yield* runScript(ctx, script);
      if (finished) {
        const completedId = script.id;
        ctx.state.baseline.completedScripts.push(completedId);
        ctx.state.baseline.currentScriptId = null;
        ctx.state.baseline.beatIndex = 0;
        fireOnScriptComplete(ctx, completedId);
      } else {
        return;
      }
      continue;
    }

    // No script — show scriptComplete picker with available next scripts.
    const available = listAvailableScripts(ctx);
    if (available.length === 0) {
      yield { type: "gameEnd" };
      return;
    }
    const completedId =
      ctx.state.baseline.completedScripts[
        ctx.state.baseline.completedScripts.length - 1
      ] ?? null;
    const input = yield {
      type: "scriptComplete",
      completedId,
      nextAvailable: available,
    };
    if (input.type === "quit") return;
    if (input.type !== "select") continue;
    const finalId = fireOnScriptSelect(ctx, input.scriptId);
    if (!ctx.scriptMap.has(finalId)) continue;
    ctx.state.baseline.currentScriptId = finalId;
    ctx.state.baseline.beatIndex = 0;
  }
}

function listAvailableScripts(ctx: PresetContext): ScriptInfo[] {
  return ctx.game.scripts
    .filter(
      (s) =>
        !ctx.state.baseline.completedScripts.includes(s.id) &&
        (s.requires === undefined ||
          evaluateCondition(s.requires, ctx.state)),
    )
    .map((s) => ({ id: s.id, title: s.title }));
}
