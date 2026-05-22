import { describe, expect, test } from "bun:test";
import {
  makeCharacter,
  makeCtx,
  makeGame,
  trackerModule,
} from "../test-utils";
import { applyActionResult } from "./applyActionResult";

describe("applyActionResult", () => {
  test("applies deltas through mutateState (source = action)", () => {
    const tracker = trackerModule();
    const game = makeGame({
      characters: [makeCharacter("alice")],
      modules: [tracker.module],
    });
    const ctx = makeCtx(game);

    applyActionResult(ctx, { deltas: { characterStats: { alice: { affection: 2 } } } });

    expect(ctx.state.baseline.characters.alice!.stats.affection).toBe(2);
    const mutated = tracker.events.find((e) => e.hook === "onStateMutated");
    expect(mutated).toBeDefined();
    expect(mutated && "source" in mutated ? mutated.source : null).toBe(
      "action",
    );
  });

  test("queues narrations into pendingNarrations", () => {
    const game = makeGame({ characters: [makeCharacter("alice")] });
    const ctx = makeCtx(game);

    applyActionResult(ctx, {
      narrations: ["第一行", "第二行"],
    });

    expect(ctx.state.runtime.pendingNarrations).toEqual([
      "第一行",
      "第二行",
    ]);
  });

  test("appends customLog to state[moduleId].log", () => {
    const game = makeGame({ characters: [makeCharacter("alice")] });
    const ctx = makeCtx(game);

    applyActionResult(ctx, {
      customLog: { moduleId: "combat", entry: { damage: 12 } },
    });
    applyActionResult(ctx, {
      customLog: { moduleId: "combat", entry: { damage: 7 } },
    });

    const log = (ctx.state.combat as { log: unknown[] }).log;
    expect(log).toEqual([{ damage: 12 }, { damage: 7 }]);
  });

  test("customLog initializes slot even when module didn't pre-register one", () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("alice")] }));

    applyActionResult(ctx, {
      customLog: { moduleId: "fresh", entry: "first" },
    });

    expect((ctx.state.fresh as { log: unknown[] }).log).toEqual(["first"]);
  });

  test("empty narrations array does not queue", () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("alice")] }));
    applyActionResult(ctx, { narrations: [] });
    expect(ctx.state.runtime.pendingNarrations).toEqual([]);
  });

  test("undefined deltas / narrations / customLog is a no-op", () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("alice")] }));
    expect(() => applyActionResult(ctx, {})).not.toThrow();
    expect(ctx.state.baseline.characters.alice!.stats.affection).toBe(0);
  });

  test("all three (deltas + narrations + customLog) apply atomically", () => {
    const tracker = trackerModule();
    const game = makeGame({
      characters: [makeCharacter("alice")],
      modules: [tracker.module],
    });
    const ctx = makeCtx(game);

    applyActionResult(ctx, {
      deltas: { characterStats: { alice: { affection: 3 } } },
      narrations: ["alice 朝你笑了"],
      customLog: { moduleId: "combat", entry: { ok: true } },
    });

    expect(ctx.state.baseline.characters.alice!.stats.affection).toBe(3);
    expect(ctx.state.runtime.pendingNarrations).toEqual(["alice 朝你笑了"]);
    expect((ctx.state.combat as { log: unknown[] }).log).toEqual([
      { ok: true },
    ]);
    // onStateMutated fired exactly once for the combined delta — the
    // engine-side atomicity guarantee
    const mutations = tracker.events.filter(
      (e) => e.hook === "onStateMutated",
    );
    expect(mutations).toHaveLength(1);
  });
});
