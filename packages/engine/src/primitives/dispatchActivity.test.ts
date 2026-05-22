import { describe, expect, test } from "bun:test";
import {
  makeAction,
  makeCharacter,
  makeCtx,
  makeGame,
  makeScript,
  trackerModule,
} from "../test-utils";
import type { Module } from "../types";
import { dispatchActivity } from "./dispatchActivity";

// Helper: drain the activity generator. Returns the final return value
// ("ok" | "quit") and any yielded outputs (usually empty since these
// primitives don't yield directly — that's runScript / runLoop's job).
async function drain(
  gen: ReturnType<typeof dispatchActivity>,
): Promise<{ outputs: unknown[]; ret: "ok" | "quit" }> {
  const outputs: unknown[] = [];
  let r = await gen.next();
  while (!r.done) {
    outputs.push(r.value);
    r = await gen.next();
  }
  return { outputs, ret: r.value };
}

describe("dispatchActivity — script:", () => {
  test("sets baseline.currentScriptId on a known, uncompleted script", async () => {
    const game = makeGame({
      characters: [makeCharacter("alice")],
      scripts: [makeScript("001_intro")],
    });
    const ctx = makeCtx(game);

    const { ret } = await drain(dispatchActivity(ctx, "script:001_intro"));

    expect(ret).toBe("ok");
    expect(ctx.state.baseline.currentScriptId).toBe("001_intro");
    expect(ctx.state.baseline.beatIndex).toBe(0);
  });

  test("ignores unknown script id (no error, no state change)", async () => {
    const game = makeGame({
      characters: [makeCharacter("alice")],
      scripts: [makeScript("001_intro")],
    });
    const ctx = makeCtx(game);

    const { ret } = await drain(dispatchActivity(ctx, "script:nonexistent"));

    expect(ret).toBe("ok");
    expect(ctx.state.baseline.currentScriptId).toBeNull();
  });

  test("ignores already-completed script", async () => {
    const game = makeGame({
      characters: [makeCharacter("alice")],
      scripts: [makeScript("001_intro")],
    });
    const ctx = makeCtx(game);
    ctx.state.baseline.completedScripts.push("001_intro");

    await drain(dispatchActivity(ctx, "script:001_intro"));

    expect(ctx.state.baseline.currentScriptId).toBeNull();
  });

  test("onScriptSelect first-wins redirects to a different script", async () => {
    const redirector: Module = {
      id: "redirector",
      onScriptSelect: (_ctx, requested) =>
        requested === "001_intro" ? "001_intro_alt" : undefined,
    };
    const game = makeGame({
      characters: [makeCharacter("alice")],
      scripts: [makeScript("001_intro"), makeScript("001_intro_alt")],
      modules: [redirector],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "script:001_intro"));

    expect(ctx.state.baseline.currentScriptId).toBe("001_intro_alt");
  });

  test("redirector targeting an unknown script id falls back to no-op", async () => {
    const redirector: Module = {
      id: "redirector",
      onScriptSelect: () => "phantom",
    };
    const game = makeGame({
      characters: [makeCharacter("alice")],
      scripts: [makeScript("001_intro")],
      modules: [redirector],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "script:001_intro"));

    expect(ctx.state.baseline.currentScriptId).toBeNull();
  });
});

describe("dispatchActivity — action:", () => {
  test("dispatches kindless action by applying effects directly", async () => {
    const action = makeAction("gift_flower", {
      effects: { affection: { alice: 1 } },
    });
    const game = makeGame({
      characters: [makeCharacter("alice")],
      actions: [action],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "action:gift_flower"));

    expect(ctx.state.baseline.characters.alice!.affection).toBe(1);
  });

  test("dispatches kinded action through actionHandlerRegistry", async () => {
    let handlerCallCount = 0;
    const mod: Module = {
      id: "mymod",
      actionHandlers: {
        custom: ({ action }) => {
          handlerCallCount++;
          return {
            deltas: { affection: { alice: 2 } },
            narrations: [`handler ran for ${action.id}`],
          };
        },
      },
    };
    const game = makeGame({
      characters: [makeCharacter("alice")],
      actions: [makeAction("special", { kind: "useItem" as const })],
      modules: [
        // alias `useItem` to `custom` — but useItem is already taken by
        // baseline. Use a fresh non-conflicting kind via cast.
      ],
    });
    // Build a fresh game with the custom-kind action
    const game2 = makeGame({
      characters: [makeCharacter("alice")],
      actions: [
        // Cast: engine's Action.kind is a string-literal union, but the
        // engine dispatch logic accepts any string. Tests confirm that.
        { id: "do_thing", title: "t", cost: 1, kind: "custom" as never },
      ],
      modules: [mod],
    });
    void game;
    const ctx = makeCtx(game2);

    await drain(dispatchActivity(ctx, "action:do_thing"));

    expect(handlerCallCount).toBe(1);
    expect(ctx.state.baseline.characters.alice!.affection).toBe(2);
    expect(ctx.state.runtime.pendingNarrations).toContain(
      "handler ran for do_thing",
    );
  });

  test("ignores unknown action id", async () => {
    const ctx = makeCtx(
      makeGame({
        characters: [makeCharacter("alice")],
        actions: [makeAction("rest")],
      }),
    );

    const { ret } = await drain(dispatchActivity(ctx, "action:nonexistent"));

    expect(ret).toBe("ok");
    expect(ctx.state.baseline.characters.alice!.affection).toBe(0);
  });

  test("respects requires — gated action does not run", async () => {
    const action = makeAction("vip_gift", {
      effects: { affection: { alice: 5 } },
      requires: { affection: { character: "alice", min: 3 } },
    });
    const game = makeGame({
      characters: [makeCharacter("alice")],
      actions: [action],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "action:vip_gift"));
    expect(ctx.state.baseline.characters.alice!.affection).toBe(0);
  });

  test("respects requires — gate satisfied, action runs", async () => {
    const action = makeAction("vip_gift", {
      effects: { affection: { alice: 5 } },
      requires: { affection: { character: "alice", min: 3 } },
    });
    const game = makeGame({
      characters: [
        makeCharacter("alice", { defaultAffection: 3 }),
      ],
      actions: [action],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "action:vip_gift"));
    expect(ctx.state.baseline.characters.alice!.affection).toBe(8);
  });
});

describe("dispatchActivity — hook composition", () => {
  test("onActionDispatch can cancel the action", async () => {
    const tracker = trackerModule();
    const canceller: Module = {
      id: "canceller",
      onActionDispatch: () => "cancel",
    };
    const action = makeAction("forbidden", {
      effects: { affection: { alice: 100 } },
    });
    const game = makeGame({
      characters: [makeCharacter("alice")],
      actions: [action],
      modules: [tracker.module, canceller],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "action:forbidden"));

    expect(ctx.state.baseline.characters.alice!.affection).toBe(0);
    // onActionComplete should NOT fire on cancel
    expect(
      tracker.events.find((e) => e.hook === "onActionComplete"),
    ).toBeUndefined();
  });

  test("onActionDispatch can substitute an alternate action", async () => {
    const substitute = makeAction("alt", {
      effects: { affection: { alice: 7 } },
    });
    const subber: Module = {
      id: "subber",
      onActionDispatch: () => substitute,
    };
    const game = makeGame({
      characters: [makeCharacter("alice")],
      actions: [
        makeAction("original", { effects: { affection: { alice: 1 } } }),
        substitute,
      ],
      modules: [subber],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "action:original"));

    expect(ctx.state.baseline.characters.alice!.affection).toBe(7);
  });

  test("hook ordering: dispatch → mutate → complete", async () => {
    const tracker = trackerModule();
    const action = makeAction("rest", {
      effects: { affection: { alice: 1 } },
    });
    const game = makeGame({
      characters: [makeCharacter("alice")],
      actions: [action],
      modules: [tracker.module],
    });
    const ctx = makeCtx(game);

    await drain(dispatchActivity(ctx, "action:rest"));

    const seq = tracker.events.map((e) => e.hook);
    expect(seq).toEqual([
      "onActionDispatch",
      "onStateMutated",
      "onActionComplete",
    ]);
  });
});
