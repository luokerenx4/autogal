import { describe, expect, test } from "bun:test";
import { evaluateCondition } from "./condition";
import { applyDelta, createInitialState } from "./state";
import { makeCharacter, makeGame, makeState, twoCharGame } from "./test-utils";
import type { ComposedState, Condition } from "./types";

function trainingGame() {
  return makeGame({
    characters: [makeCharacter("alice")],
    training: {
      slotsPerDay: 3,
      slotNames: ["上午", "下午", "晚上"],
      startDay: 1,
      maxDay: 14,
      decayPerDay: 0,
      decayStatId: "spectral",
      sleepActionId: "sleep",
      huntActionId: "hunt",
      stats: [{ id: "spectral", name: "灵体化", min: 0, max: 100, start: 5 }],
      endConditions: [],
    },
  });
}

describe("evaluateCondition — affection", () => {
  test("min satisfied", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, { characterStats: { alice: { affection: 3 } } });
    expect(
      evaluateCondition(
        { affection: { character: "alice", min: 2 } },
        state,
      ).ok,
    ).toBe(true);
  });

  test("min not satisfied", () => {
    const state = createInitialState(twoCharGame());
    expect(
      evaluateCondition(
        { affection: { character: "alice", min: 1 } },
        state,
      ).ok,
    ).toBe(false);
  });

  test("max satisfied (under cap)", () => {
    const state = createInitialState(twoCharGame());
    expect(
      evaluateCondition(
        { affection: { character: "alice", max: 5 } },
        state,
      ).ok,
    ).toBe(true);
  });

  test("eq match", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, { characterStats: { alice: { affection: 4 } } });
    expect(
      evaluateCondition(
        { affection: { character: "alice", eq: 4 } },
        state,
      ).ok,
    ).toBe(true);
    expect(
      evaluateCondition(
        { affection: { character: "alice", eq: 3 } },
        state,
      ).ok,
    ).toBe(false);
  });

  test("unknown character returns false (silent — era residue, will throw post Phase 5)", () => {
    const state = createInitialState(twoCharGame());
    expect(
      evaluateCondition(
        { affection: { character: "ghost", min: 0 } },
        state,
      ).ok,
    ).toBe(false);
  });
});

describe("evaluateCondition — variable", () => {
  test("eq match for string variable", () => {
    const state = makeState();
    applyDelta(state, { variables: { route: "alice" } });
    expect(
      evaluateCondition({ variable: { name: "route", eq: "alice" } }, state).ok,
    ).toBe(true);
  });

  test("eq mismatch for string variable", () => {
    const state = makeState();
    applyDelta(state, { variables: { route: "alice" } });
    expect(
      evaluateCondition({ variable: { name: "route", eq: "bea" } }, state).ok,
    ).toBe(false);
  });

  test("min/max on numeric variable", () => {
    const state = makeState();
    applyDelta(state, { variables: { gold: 50 } });
    expect(
      evaluateCondition({ variable: { name: "gold", min: 25 } }, state).ok,
    ).toBe(true);
    expect(
      evaluateCondition({ variable: { name: "gold", max: 25 } }, state).ok,
    ).toBe(false);
  });

  test("min/max on string variable returns false", () => {
    const state = makeState();
    applyDelta(state, { variables: { route: "alice" } });
    expect(
      evaluateCondition({ variable: { name: "route", min: 1 } }, state).ok,
    ).toBe(false);
  });

  test("missing variable with min/max returns false (silent era-residue)", () => {
    const state = makeState();
    expect(
      evaluateCondition({ variable: { name: "absent", min: 1 } }, state).ok,
    ).toBe(false);
  });
});

describe("evaluateCondition — switch", () => {
  test("switch eq true", () => {
    const state = makeState();
    applyDelta(state, { switches: { unlocked: true } });
    expect(
      evaluateCondition({ switch: { name: "unlocked", eq: true } }, state).ok,
    ).toBe(true);
    expect(
      evaluateCondition({ switch: { name: "unlocked", eq: false } }, state).ok,
    ).toBe(false);
  });

  test("bare switch reference defaults to eq true", () => {
    const state = makeState();
    applyDelta(state, { switches: { unlocked: true } });
    expect(
      evaluateCondition({ switch: { name: "unlocked" } }, state).ok,
    ).toBe(true);
  });

  test("missing switch reads as false", () => {
    const state = makeState();
    expect(
      evaluateCondition({ switch: { name: "absent" } }, state).ok,
    ).toBe(false);
  });
});

describe("evaluateCondition — scriptCompleted", () => {
  test("returns true when script id is in completedScripts", () => {
    const state = makeState();
    state.baseline.scripts["001_intro"] = { completed: true, selfSwitches: { A: false, B: false, C: false, D: false } };
    expect(
      evaluateCondition({ scriptCompleted: "001_intro" }, state).ok,
    ).toBe(true);
  });

  test("returns false when not completed", () => {
    const state = makeState();
    expect(
      evaluateCondition({ scriptCompleted: "001_intro" }, state).ok,
    ).toBe(false);
  });
});

describe("evaluateCondition — composite (all/any/not)", () => {
  function setup(): ComposedState {
    const state = createInitialState(twoCharGame());
    applyDelta(state, {
      characterStats: { alice: { affection: 3 } },
      variables: { route: "alice" },
    });
    state.baseline.scripts["001_intro"] = { completed: true, selfSwitches: { A: false, B: false, C: false, D: false } };
    return state;
  }

  test("all: every branch must match", () => {
    const state = setup();
    expect(
      evaluateCondition(
        {
          all: [
            { scriptCompleted: "001_intro" },
            { affection: { character: "alice", min: 2 } },
          ],
        },
        state,
      ).ok,
    ).toBe(true);
  });

  test("all: short-circuits to false on first mismatch", () => {
    const state = setup();
    expect(
      evaluateCondition(
        {
          all: [
            { scriptCompleted: "001_intro" },
            { affection: { character: "alice", min: 999 } },
          ],
        },
        state,
      ).ok,
    ).toBe(false);
  });

  test("any: returns true on first match", () => {
    const state = setup();
    expect(
      evaluateCondition(
        {
          any: [
            { affection: { character: "alice", min: 999 } },
            { variable: { name: "route", eq: "alice" } },
          ],
        },
        state,
      ).ok,
    ).toBe(true);
  });

  test("any: false only when all branches false", () => {
    const state = setup();
    expect(
      evaluateCondition(
        {
          any: [
            { affection: { character: "alice", min: 999 } },
            { variable: { name: "route", eq: "bea" } },
          ],
        },
        state,
      ).ok,
    ).toBe(false);
  });

  test("not: inverts", () => {
    const state = setup();
    expect(
      evaluateCondition(
        { not: { scriptCompleted: "missing_script" } },
        state,
      ).ok,
    ).toBe(true);
  });

  test("nested all/any/not", () => {
    const state = setup();
    const cond: Condition = {
      all: [
        { any: [{ variable: { name: "route", eq: "alice" } }, { variable: { name: "route", eq: "bea" } }] },
        { not: { scriptCompleted: "missing" } },
      ],
    };
    expect(evaluateCondition(cond, state).ok).toBe(true);
  });
});

describe("evaluateCondition — training stats", () => {
  test("stat min/max checks training.stats", () => {
    const state = createInitialState(trainingGame());
    expect(
      evaluateCondition({ stat: { name: "spectral", min: 5 } }, state).ok,
    ).toBe(true);
    expect(
      evaluateCondition({ stat: { name: "spectral", max: 4 } }, state).ok,
    ).toBe(false);
  });

  test("missing stat returns false", () => {
    const state = createInitialState(trainingGame());
    expect(
      evaluateCondition({ stat: { name: "missing_stat", min: 0 } }, state).ok,
    ).toBe(false);
  });

  test("stat against non-training state returns false", () => {
    const state = makeState();
    expect(
      evaluateCondition({ stat: { name: "any", min: 0 } }, state).ok,
    ).toBe(false);
  });

  test("day and slot read training calendar", () => {
    const state = createInitialState(trainingGame());
    expect(evaluateCondition({ day: { eq: 1 } }, state).ok).toBe(true);
    expect(evaluateCondition({ day: { min: 2 } }, state).ok).toBe(false);
    expect(evaluateCondition({ slot: { eq: 0 } }, state).ok).toBe(true);
  });
});

describe("evaluateCondition — inventory / weaponPower / knowsSkill", () => {
  test("inventory min", () => {
    const state = makeState();
    applyDelta(state, { inventory: { potion: 3 } });
    expect(
      evaluateCondition({ inventory: { itemId: "potion", min: 2 } }, state).ok,
    ).toBe(true);
    expect(
      evaluateCondition({ inventory: { itemId: "potion", min: 5 } }, state).ok,
    ).toBe(false);
  });

  test("inventory absent counts as 0", () => {
    const state = makeState();
    expect(
      evaluateCondition({ inventory: { itemId: "potion", max: 0 } }, state).ok,
    ).toBe(true);
  });

  test("weaponPower against equipped weapon", () => {
    const game = makeGame({
      weapons: [
        { id: "yaodao", name: "妖刀", description: "", basePower: 3 },
      ],
    });
    const state = createInitialState(game);
    applyDelta(state, { weapons: { yaodao: { power: 7 } } });
    expect(
      evaluateCondition(
        { weaponPower: { weaponId: "yaodao", min: 10 } },
        state,
      ).ok,
    ).toBe(true);
  });

  test("weaponPower against unknown weapon returns false", () => {
    const state = makeState();
    expect(
      evaluateCondition(
        { weaponPower: { weaponId: "phantom", min: 0 } },
        state,
      ).ok,
    ).toBe(false);
  });

  test("knowsSkill returns true once learned", () => {
    const state = makeState();
    expect(evaluateCondition({ knowsSkill: "purify" }, state).ok).toBe(false);
    applyDelta(state, { skills: { learn: ["purify"] } });
    expect(evaluateCondition({ knowsSkill: "purify" }, state).ok).toBe(true);
  });
});

describe("evaluateCondition — selfSwitch", () => {
  test("reads false for missing entry", () => {
    const state = makeState();
    expect(
      evaluateCondition(
        { selfSwitch: { scriptId: "q", name: "A" } },
        state,
      ).ok,
    ).toBe(false);
  });

  test("eq true (bare) matches a flipped switch", () => {
    const state = makeState();
    applyDelta(state, { selfSwitches: { q: { A: true } } });
    expect(
      evaluateCondition(
        { selfSwitch: { scriptId: "q", name: "A" } },
        state,
      ).ok,
    ).toBe(true);
    expect(
      evaluateCondition(
        { selfSwitch: { scriptId: "q", name: "A", eq: true } },
        state,
      ).ok,
    ).toBe(true);
    expect(
      evaluateCondition(
        { selfSwitch: { scriptId: "q", name: "A", eq: false } },
        state,
      ).ok,
    ).toBe(false);
  });

  test("independent per scriptId", () => {
    const state = makeState();
    applyDelta(state, { selfSwitches: { q1: { A: true } } });
    expect(
      evaluateCondition(
        { selfSwitch: { scriptId: "q2", name: "A" } },
        state,
      ).ok,
    ).toBe(false);
  });
});

describe("evaluateCondition — unhandled shape returns false", () => {
  test("malformed condition does not throw", () => {
    const state = makeState();
    expect(() =>
      evaluateCondition({} as Condition, state),
    ).not.toThrow();
    expect(evaluateCondition({} as Condition, state).ok).toBe(false);
  });
});
