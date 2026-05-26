import { describe, expect, test } from "bun:test";
import {
  makeCharacter,
  makeCtx,
  makeGame,
} from "../test-utils";
import { drainNarrations } from "./drainNarrations";

// Drive an AsyncGenerator with a scripted input sequence. Returns the
// list of yielded outputs in order. The generator advances once per
// scripted input — the input is sent into the next() call following
// the corresponding yield.
async function drive<O, R, I>(
  gen: AsyncGenerator<O, R, I>,
  inputs: I[],
): Promise<{ outputs: O[]; ret: R | undefined }> {
  const outputs: O[] = [];
  let r = await gen.next();
  let i = 0;
  while (!r.done && i < inputs.length + 10) {
    outputs.push(r.value);
    const input = inputs[i] ?? (undefined as unknown as I);
    r = await gen.next(input);
    i++;
  }
  return { outputs, ret: r.done ? r.value : undefined };
}

describe("drainNarrations — input-type protocol", () => {
  test("advances on `next`", async () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("first", "second");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "next" },
      { type: "next" },
    ]);
    expect(outputs.map((o) => ({ type: o.type, text: (o as { text: string }).text }))).toEqual([
      { type: "narration", text: "first" },
      { type: "narration", text: "second" },
    ]);
    expect(ctx.state.runtime.pendingNarrations).toEqual([]);
  });

  test("`quit` returns immediately without draining", async () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("first", "second");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "quit" },
    ]);
    expect(outputs.map((o) => ({ type: o.type, text: (o as { text: string }).text }))).toEqual([
      { type: "narration", text: "first" },
    ]);
    // Narration NOT consumed — caller will see it again next time
    expect(ctx.state.runtime.pendingNarrations).toEqual(["first", "second"]);
  });

  test("`doActivity` does NOT advance — re-yields the same narration", async () => {
    // Regression: previously any non-quit input drained one narration,
    // so a doActivity sent while narrations are pending was silently
    // eaten. Strict protocol re-yields instead, so the caller notices
    // their input was a no-op for this output type.
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("only");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "doActivity", id: "attack" },
      { type: "doActivity", id: "attack" },
      { type: "next" },
    ]);
    expect(outputs.map((o) => ({ type: o.type, text: (o as { text: string }).text }))).toEqual([
      { type: "narration", text: "only" },
      { type: "narration", text: "only" },
      { type: "narration", text: "only" },
    ]);
    expect(ctx.state.runtime.pendingNarrations).toEqual([]);
  });

  test("`choose` does NOT advance — same re-yield protocol", async () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("only");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "choose", index: 0 },
      { type: "next" },
    ]);
    expect(outputs).toHaveLength(2);
    expect(outputs.every((o) => o.type === "narration")).toBe(true);
    expect(ctx.state.runtime.pendingNarrations).toEqual([]);
  });

  test("`select` does NOT advance", async () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("only");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "select", scriptId: "001" },
      { type: "next" },
    ]);
    expect(outputs).toHaveLength(2);
    expect(ctx.state.runtime.pendingNarrations).toEqual([]);
  });

  test("empty queue yields nothing", async () => {
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    const { outputs } = await drive(drainNarrations(ctx), []);
    expect(outputs).toEqual([]);
  });

  test("each yielded narration carries pendingCount = queue length incl. self", async () => {
    // AI players / UI renderers detect "more narrations queued" via
    // this field instead of inferring from re-yields. The count
    // decrements as narrations drain.
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("a", "b", "c");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "next" },
      { type: "next" },
      { type: "next" },
    ]);
    expect(
      outputs.map((o) => ({
        text: (o as { text: string }).text,
        pendingCount: (o as { pendingCount?: number }).pendingCount,
      })),
    ).toEqual([
      { text: "a", pendingCount: 3 },
      { text: "b", pendingCount: 2 },
      { text: "c", pendingCount: 1 },
    ]);
  });

  test("pendingCount on re-yield reflects the unchanged queue", async () => {
    // If a non-next input causes a re-yield, the queue didn't shrink —
    // pendingCount should also stay constant so the caller's preflight
    // check ("send next first") is correct.
    const ctx = makeCtx(makeGame({ characters: [makeCharacter("a")] }));
    ctx.state.runtime.pendingNarrations.push("a", "b");
    const { outputs } = await drive(drainNarrations(ctx), [
      { type: "doActivity", id: "x" }, // re-yield "a"
      { type: "doActivity", id: "x" }, // re-yield "a"
      { type: "next" }, // drain "a", yield "b"
      { type: "next" }, // drain "b", end
    ]);
    expect(
      outputs.map((o) => ({
        text: (o as { text: string }).text,
        pendingCount: (o as { pendingCount?: number }).pendingCount,
      })),
    ).toEqual([
      { text: "a", pendingCount: 2 },
      { text: "a", pendingCount: 2 },
      { text: "a", pendingCount: 2 },
      { text: "b", pendingCount: 1 },
    ]);
  });
});
