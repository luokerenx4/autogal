import { describe, expect, test } from "bun:test";
import {
  makeCharacter,
  makeCtx,
  makeGame,
  makeScript,
} from "../test-utils";
import type { Beat } from "../types";
import { runScript } from "./runScript";

async function drive<I, O>(
  gen: AsyncGenerator<O, boolean, I>,
  inputs: I[],
): Promise<{ outputs: O[]; finished: boolean | undefined }> {
  const outputs: O[] = [];
  let r = await gen.next();
  let i = 0;
  while (!r.done && i < inputs.length + 20) {
    outputs.push(r.value);
    const input = inputs[i] ?? (undefined as unknown as I);
    r = await gen.next(input);
    i++;
  }
  return { outputs, finished: r.done ? r.value : undefined };
}

describe("runScript — narration / dialogue input protocol", () => {
  test("narration advances only on `next`", async () => {
    const beats: Beat[] = [
      { type: "narration", text: "line one" },
      { type: "narration", text: "line two" },
      { type: "endScript" },
    ];
    const ctx = makeCtx(
      makeGame({
        characters: [makeCharacter("a")],
        scripts: [makeScript("s1", { beats })],
      }),
    );
    ctx.state.baseline.currentScriptId = "s1";
    const script = ctx.scriptMap.get("s1")!;
    // Send doActivity while narration is yielded — should re-yield
    // same narration. Then next to advance.
    const { outputs, finished } = await drive(runScript(ctx, script), [
      { type: "doActivity", id: "x" },
      { type: "next" },
      { type: "next" },
    ]);
    expect(finished).toBe(true);
    expect(outputs.map((o) => (o as { text: string }).text)).toEqual([
      "line one",
      "line one",
      "line two",
    ]);
  });

  test("dialogue advances only on `next`", async () => {
    const beats: Beat[] = [
      { type: "dialogue", speaker: "a", text: "hi" },
      { type: "endScript" },
    ];
    const ctx = makeCtx(
      makeGame({
        characters: [makeCharacter("a")],
        scripts: [makeScript("s1", { beats })],
      }),
    );
    ctx.state.baseline.currentScriptId = "s1";
    const script = ctx.scriptMap.get("s1")!;
    const { outputs, finished } = await drive(runScript(ctx, script), [
      { type: "choose", index: 0 },
      { type: "next" },
    ]);
    expect(finished).toBe(true);
    // First yield = dialogue. Second yield = same dialogue (choose was
    // ignored). Then next ends the script.
    expect(outputs).toHaveLength(2);
    expect(outputs[0]?.type).toBe("dialogue");
    expect(outputs[1]?.type).toBe("dialogue");
  });

  test("quit on narration still terminates", async () => {
    const beats: Beat[] = [
      { type: "narration", text: "one" },
      { type: "endScript" },
    ];
    const ctx = makeCtx(
      makeGame({
        characters: [makeCharacter("a")],
        scripts: [makeScript("s1", { beats })],
      }),
    );
    ctx.state.baseline.currentScriptId = "s1";
    const script = ctx.scriptMap.get("s1")!;
    const { finished } = await drive(runScript(ctx, script), [
      { type: "quit" },
    ]);
    expect(finished).toBe(false);
  });
});
