// Training-mode preset main loop. Same shape as vn/run.ts but with
// three extra responsibilities:
//   - end-condition check (per game.training.endConditions)
//   - hub Output via fireOnHubBuild (the training Module above
//     provides the actual hubMenu snapshot)
//   - action dispatch (via dispatchActivity primitive)
//
// All engine primitives this file uses are exported from
// `@autogal/engine`, so an ejected copy of this file works unchanged
// outside the engine source tree.

import {
  checkEndConditions,
  checkTriggers,
  dispatchActivity,
  drainNarrations,
  fireOnActionComplete,
  fireOnEndConditionFire,
  fireOnHubBuild,
  fireOnScriptComplete,
  fireOnSessionStart,
  runScript,
} from "@autogal/engine";
import type { Action, Input, Output, PresetContext } from "@autogal/engine";

// Default export is the RunFunction itself — this is what the CLI
// loader picks up when game.yaml says `preset: ./preset/run.ts`
// (the --eject scenario). Named export is kept for engine-internal
// consumers (state.ts resolveRunFn).
//
// ════════════════════════════════════════════════════════════════
// EJECTED for 妖刀さくら抄 — this loop is a copy of the engine's
// bundled `training` preset (packages/engine/src/presets/training/),
// living in the game folder so the author can customize without
// touching engine source.
//
// Game-specific tweak in this copy: a "daybreak" narration injected
// at the start of each new day's morning slot. Pure cosmetic — adds
// atmospheric flavor without affecting game logic. Demonstrates that
// the ejected loop is editable.
// ════════════════════════════════════════════════════════════════
export default trainingRun;

export async function* trainingRun(
  ctx: PresetContext,
): AsyncGenerator<Output, void, Input> {
  fireOnSessionStart(ctx);
  // Catch triggers already-active in seed state (e.g. fixture injects
  // spectral=90 with a "spectral runaway" trigger that fires at >=80).
  // mutateState wouldn't fire them since no mutation happened yet.
  checkTriggers(ctx);

  // Game-specific: track the last day we emitted a daybreak line so
  // we only do it once per day rollover. Lives on a private flag.
  let lastDaybreakDay = ctx.state.training?.day ?? 0;

  while (true) {
    // Game-specific tweak: at the start of each new day (slot 0),
    // push a daybreak narration into the queue once. Drains naturally
    // via the normal narration path on the next step().
    const t = ctx.state.training;
    if (t && t.slot === 0 && t.day !== lastDaybreakDay) {
      ctx.state.runtime.pendingNarrations.push(
        `═ Day ${t.day} ═ 山顶的雾在散。今天会发生什么？`,
      );
      lastDaybreakDay = t.day;
    }

    yield* drainNarrations(ctx);

    // End conditions check — only when no script is mid-flight, so an
    // in-progress ending script doesn't get clobbered.
    if (ctx.state.baseline.currentScriptId === null) {
      const endCheck = checkEndConditions(ctx);
      if (endCheck) {
        fireOnEndConditionFire(ctx, endCheck);
        if (
          endCheck.goto &&
          !ctx.state.baseline.completedScripts.includes(endCheck.goto) &&
          ctx.scriptMap.has(endCheck.goto)
        ) {
          ctx.state.baseline.currentScriptId = endCheck.goto;
          ctx.state.baseline.beatIndex = 0;
          continue;
        }
        yield { type: "gameEnd", reason: endCheck.reason };
        return;
      }
    }

    // Run the current script if one is set.
    if (ctx.state.baseline.currentScriptId !== null) {
      const script = ctx.scriptMap.get(ctx.state.baseline.currentScriptId);
      if (!script) {
        throw new Error(
          `trainingRun: current script not found: ${ctx.state.baseline.currentScriptId}`,
        );
      }
      const finished = yield* runScript(ctx, script);
      if (finished) {
        const completedId = script.id;
        ctx.state.baseline.completedScripts.push(completedId);
        ctx.state.baseline.currentScriptId = null;
        ctx.state.baseline.beatIndex = 0;
        fireOnScriptComplete(ctx, completedId);
        // Scripts count as 1 slot — fire onActionComplete with synthetic
        // action so the training Module's calendar advance picks it up.
        const completedAction: Action = {
          id: completedId,
          title: script.title,
          cost: 1,
        };
        fireOnActionComplete(ctx, completedAction, undefined);
      } else {
        return;
      }
      continue;
    }

    // Hub.
    const hubOutput = fireOnHubBuild(ctx);
    if (hubOutput === undefined) {
      // No module claimed the hub. Should not normally happen when
      // game.training is configured (the bundled training Module
      // always returns a hub). Fall through to gameEnd to avoid an
      // infinite loop.
      yield { type: "gameEnd" };
      return;
    }
    const input = yield hubOutput;
    if (input.type === "quit") return;
    if (input.type !== "doActivity") continue;
    const dispatched = yield* dispatchActivity(ctx, input.id);
    if (dispatched === "quit") return;
  }
}
