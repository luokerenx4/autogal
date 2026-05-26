import { describe, expect, test } from "bun:test";
import { evaluateCondition } from "./condition";
import { applyDelta, createInitialState } from "./state";
import { makeCharacter, makeGame, makeState, twoCharGame } from "./test-utils";
import type { Condition } from "./types";

// When ok=true, reason is omitted.
describe("ConditionResult.reason — present iff ok=false", () => {
  test("ok=true result carries no reason", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, { characterStats: { alice: { affection: 3 } } });
    const r = evaluateCondition(
      { affection: { character: "alice", min: 2 } },
      state,
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});

describe("ConditionResult.reason — atomic leaves", () => {
  test("affection min not met cites scope + threshold + current value", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, { characterStats: { alice: { affection: 1 } } });
    const r = evaluateCondition(
      { affection: { character: "alice", min: 4 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("affection.alice");
    expect(r.reason).toContain("4");
    expect(r.reason).toContain("1");
  });

  test("characterStat max exceeded cites ≤ + current", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, { characterStats: { alice: { spectral: 60 } } });
    const r = evaluateCondition(
      { characterStat: { character: "alice", name: "spectral", max: 49 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("alice.spectral");
    expect(r.reason).toContain("49");
    expect(r.reason).toContain("60");
  });

  test("variable min not met", () => {
    const state = makeState();
    applyDelta(state, { variables: { raidsCompleted: 5 } });
    const r = evaluateCondition(
      { variable: { name: "raidsCompleted", min: 7 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("raidsCompleted");
    expect(r.reason).toContain("7");
    expect(r.reason).toContain("5");
  });

  test("switch missing cites switch name", () => {
    const state = makeState();
    const r = evaluateCondition(
      { switch: { name: "learnedChinkonho" } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("learnedChinkonho");
  });

  test("inventory shortfall cites item id", () => {
    const state = makeState();
    const r = evaluateCondition(
      { inventory: { itemId: "oni_horn", min: 1 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("oni_horn");
    expect(r.reason).toContain("1");
  });

  test("knowsSkill missing cites skill id", () => {
    const state = makeState();
    const r = evaluateCondition({ knowsSkill: "chinkonho" }, state);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("chinkonho");
  });

  test("scriptCompleted missing cites script id", () => {
    const state = makeState();
    const r = evaluateCondition(
      { scriptCompleted: "letter_02_rival" },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("letter_02_rival");
  });

  test("weaponPower for unequipped weapon cites weapon", () => {
    const state = makeState();
    const r = evaluateCondition(
      { weaponPower: { weaponId: "yaodao", min: 5 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("yaodao");
  });
});

describe("ConditionResult.reason — composite (all/any/not)", () => {
  test("all joins failed subreasons", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, {
      characterStats: { alice: { affection: 1 } },
      variables: { raidsCompleted: 2 },
    });
    const cond: Condition = {
      all: [
        { affection: { character: "alice", min: 4 } },
        { variable: { name: "raidsCompleted", min: 7 } },
      ],
    };
    const r = evaluateCondition(cond, state);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("affection.alice");
    expect(r.reason).toContain("raidsCompleted");
  });

  test("all reports nothing about already-satisfied branches", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, {
      characterStats: { alice: { affection: 9 } },
      variables: { raidsCompleted: 2 },
    });
    const cond: Condition = {
      all: [
        { affection: { character: "alice", min: 4 } }, // satisfied
        { variable: { name: "raidsCompleted", min: 7 } }, // not
      ],
    };
    const r = evaluateCondition(cond, state);
    expect(r.ok).toBe(false);
    expect(r.reason).not.toContain("affection.alice");
    expect(r.reason).toContain("raidsCompleted");
  });

  test("any lists alternatives when all branches fail", () => {
    const state = createInitialState(twoCharGame());
    const cond: Condition = {
      any: [
        { affection: { character: "alice", min: 4 } },
        { variable: { name: "raidsCompleted", min: 7 } },
      ],
    };
    const r = evaluateCondition(cond, state);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("affection.alice");
    expect(r.reason).toContain("raidsCompleted");
    expect(r.reason).toContain("/"); // separator between alternatives
  });

  test("not failure cites the inner satisfied predicate", () => {
    const state = makeState();
    state.baseline.scripts["intro"] = {
      completed: true,
      selfSwitches: { A: false, B: false, C: false, D: false },
    };
    const r = evaluateCondition(
      { not: { scriptCompleted: "intro" } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("否定");
  });
});

describe("ConditionResult — non-numeric / unknown shapes", () => {
  test("unknown character produces a useful reason", () => {
    const state = createInitialState(twoCharGame());
    const r = evaluateCondition(
      { affection: { character: "ghost", min: 0 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("ghost");
  });

  test("malformed condition returns ok=false with reason", () => {
    const state = makeState();
    const r = evaluateCondition({} as Condition, state);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeDefined();
  });

  test("inventory exact eq miss cites item", () => {
    const state = makeState();
    applyDelta(state, { inventory: { ryo: 10 } });
    const r = evaluateCondition(
      { inventory: { itemId: "ryo", eq: 50 } },
      state,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("ryo");
    expect(r.reason).toContain("50");
  });
});

// Helper: silence unused-import noise in editors. The training/test-utils
// makeCharacter/makeGame are pulled in alongside other tests; reference
// them here so the import doesn't get auto-pruned.
makeCharacter;
makeGame;
