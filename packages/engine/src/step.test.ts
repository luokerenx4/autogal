import { describe, expect, test } from "bun:test";
import { peek, step } from "./step";
import { markScriptCompleted } from "./state";
import {
  makeCharacter,
  makeGame,
  makeScript,
  makeState,
} from "./test-utils";

// Helper: a 2-script game where one script auto-ends after completing.
// We seed both scripts as completed to land at the "no more scripts"
// gameEnd state.
function exhaustedGame() {
  const game = makeGame({
    characters: [makeCharacter("alice")],
    scripts: [makeScript("001"), makeScript("002")],
  });
  const state = makeState(game);
  markScriptCompleted(state, "001");
  markScriptCompleted(state, "002");
  return { game, state };
}

describe("step / peek — gameEnd terminality", () => {
  test("peek at gameEnd reports done:true (not done:false with gameEnd output)", async () => {
    const { game, state } = exhaustedGame();
    const r = await peek(game, state);
    expect(r.output).toMatchObject({ type: "gameEnd" });
    expect(r.done).toBe(true);
  });

  test("step at gameEnd is idempotent: returns gameEnd, done:true", async () => {
    const { game, state } = exhaustedGame();
    const r = await step(game, state, { type: "next" });
    expect(r.output).toMatchObject({ type: "gameEnd" });
    expect(r.done).toBe(true);
  });

  test("step at gameEnd does NOT return output:null (regression)", async () => {
    const { game, state } = exhaustedGame();
    const r = await step(game, state, { type: "next" });
    expect(r.output).not.toBeNull();
  });

  test("step at gameEnd ignores all input types (no-op past end)", async () => {
    const { game, state } = exhaustedGame();
    for (const input of [
      { type: "next" as const },
      { type: "quit" as const },
      { type: "choose" as const, index: 0 },
      { type: "select" as const, scriptId: "001" },
    ]) {
      const r = await step(game, state, input);
      expect(r.output).toMatchObject({ type: "gameEnd" });
      expect(r.done).toBe(true);
    }
  });
});
