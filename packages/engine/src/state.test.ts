import { describe, expect, test } from "bun:test";
import { applyDelta, createInitialState } from "./state";
import {
  makeAction,
  makeCharacter,
  makeGame,
  makeState,
  twoCharGame,
} from "./test-utils";
import type { WeaponDef } from "./types";

describe("applyDelta — affection", () => {
  test("adds to character affection", () => {
    const game = twoCharGame();
    const state = createInitialState(game);
    applyDelta(state, { affection: { alice: 2 } });
    expect(state.baseline.characters.alice!.affection).toBe(2);
  });

  test("subtraction supported", () => {
    const game = makeGame({
      characters: [makeCharacter("alice", { defaultAffection: 3 })],
    });
    const state = createInitialState(game);
    applyDelta(state, { affection: { alice: -2 } });
    expect(state.baseline.characters.alice!.affection).toBe(1);
  });

  test("unknown character is silently ignored", () => {
    const state = createInitialState(twoCharGame());
    expect(() =>
      applyDelta(state, { affection: { ghost: 1 } }),
    ).not.toThrow();
    expect(state.baseline.characters.ghost).toBeUndefined();
  });

  test("multiple characters in one delta", () => {
    const state = createInitialState(twoCharGame());
    applyDelta(state, { affection: { alice: 2, bob: -1 } });
    expect(state.baseline.characters.alice!.affection).toBe(2);
    expect(state.baseline.characters.bob!.affection).toBe(-1);
  });
});

describe("applyDelta — flags", () => {
  test("numeric flags are summed additively", () => {
    const state = makeState();
    applyDelta(state, { flags: { gold: 10 } });
    applyDelta(state, { flags: { gold: 5 } });
    expect(state.baseline.flags.gold).toBe(15);
  });

  test("string flags are last-write-wins", () => {
    const state = makeState();
    applyDelta(state, { flags: { route: "alice" } });
    applyDelta(state, { flags: { route: "bea" } });
    expect(state.baseline.flags.route).toBe("bea");
  });

  test("boolean flags are last-write-wins", () => {
    const state = makeState();
    applyDelta(state, { flags: { unlocked: false } });
    applyDelta(state, { flags: { unlocked: true } });
    expect(state.baseline.flags.unlocked).toBe(true);
  });

  test("setting a numeric flag with non-number replaces", () => {
    const state = makeState();
    applyDelta(state, { flags: { x: 5 } });
    applyDelta(state, { flags: { x: "five" } });
    expect(state.baseline.flags.x).toBe("five");
  });
});

describe("applyDelta — inventory", () => {
  test("positive delta adds count", () => {
    const state = makeState();
    applyDelta(state, { inventory: { potion: 3 } });
    expect(state.baseline.inventory.potion).toBe(3);
  });

  test("counts sum across deltas", () => {
    const state = makeState();
    applyDelta(state, { inventory: { potion: 2 } });
    applyDelta(state, { inventory: { potion: 3 } });
    expect(state.baseline.inventory.potion).toBe(5);
  });

  test("negative delta drains stock and prunes at 0", () => {
    const state = makeState();
    applyDelta(state, { inventory: { potion: 3 } });
    applyDelta(state, { inventory: { potion: -3 } });
    expect(state.baseline.inventory.potion).toBeUndefined();
  });

  test("over-drain clamps to removal (no negative count)", () => {
    const state = makeState();
    applyDelta(state, { inventory: { potion: 1 } });
    applyDelta(state, { inventory: { potion: -5 } });
    expect(state.baseline.inventory.potion).toBeUndefined();
  });
});

describe("applyDelta — weapons", () => {
  const yaodao: WeaponDef = {
    id: "yaodao",
    name: "妖刀",
    description: "",
    basePower: 3,
  };

  test("power adds to weapon", () => {
    const game = makeGame({
      characters: [makeCharacter("alice")],
      weapons: [yaodao],
    });
    const state = createInitialState(game);
    expect(state.baseline.weapons.yaodao!.power).toBe(3);
    applyDelta(state, { weapons: { yaodao: { power: 4 } } });
    expect(state.baseline.weapons.yaodao!.power).toBe(7);
  });

  test("power clamps at 0 (no negative power)", () => {
    const game = makeGame({ weapons: [yaodao] });
    const state = createInitialState(game);
    applyDelta(state, { weapons: { yaodao: { power: -10 } } });
    expect(state.baseline.weapons.yaodao!.power).toBe(0);
  });

  test("unknown weapon id is silently ignored", () => {
    const state = createInitialState(makeGame({ weapons: [yaodao] }));
    expect(() =>
      applyDelta(state, { weapons: { phantom: { power: 1 } } }),
    ).not.toThrow();
    expect(state.baseline.weapons.phantom).toBeUndefined();
  });

  test("auto-equips a single declared weapon", () => {
    const state = createInitialState(makeGame({ weapons: [yaodao] }));
    expect(state.baseline.equippedWeaponId).toBe("yaodao");
  });

  test("does not auto-equip when multiple weapons declared", () => {
    const state = createInitialState(
      makeGame({
        weapons: [
          yaodao,
          { id: "katana", name: "刀", description: "", basePower: 2 },
        ],
      }),
    );
    expect(state.baseline.equippedWeaponId).toBeNull();
  });
});

describe("applyDelta — skills", () => {
  test("learn adds to knownSkills", () => {
    const state = makeState();
    applyDelta(state, { skills: { learn: ["purify"] } });
    expect(state.baseline.knownSkills).toEqual(["purify"]);
  });

  test("learn is set-semantics (no duplicates)", () => {
    const state = makeState();
    applyDelta(state, { skills: { learn: ["purify"] } });
    applyDelta(state, { skills: { learn: ["purify"] } });
    expect(state.baseline.knownSkills).toEqual(["purify"]);
  });

  test("forget removes from knownSkills", () => {
    const state = makeState();
    applyDelta(state, { skills: { learn: ["purify", "warding"] } });
    applyDelta(state, { skills: { forget: ["purify"] } });
    expect(state.baseline.knownSkills).toEqual(["warding"]);
  });

  test("forgetting an unknown skill is a no-op", () => {
    const state = makeState();
    applyDelta(state, { skills: { forget: ["nonexistent"] } });
    expect(state.baseline.knownSkills).toEqual([]);
  });

  test("learn-then-forget within one delta applies in order", () => {
    const state = makeState();
    applyDelta(state, {
      skills: { learn: ["purify"], forget: ["purify"] },
    });
    expect(state.baseline.knownSkills).toEqual([]);
  });
});

describe("applyDelta — stats", () => {
  // stats only apply when training state exists; test the training
  // preset's clamping rule here via a minimal training-mode game.
  function makeTrainingGame() {
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
        stats: [
          { id: "spectral", name: "灵体化", min: 0, max: 100, start: 5 },
          { id: "physical", name: "体力", min: 0, max: 20, start: 10 },
        ],
        endConditions: [],
      },
    });
  }

  test("stat delta adds to current value", () => {
    const state = createInitialState(makeTrainingGame());
    applyDelta(state, { stats: { spectral: 3 } });
    expect(state.training!.stats.spectral).toBe(8);
  });

  test("stat delta clamps at statMax", () => {
    const state = createInitialState(makeTrainingGame());
    applyDelta(state, { stats: { physical: 100 } });
    expect(state.training!.stats.physical).toBe(20);
  });

  test("stat delta clamps at 0", () => {
    const state = createInitialState(makeTrainingGame());
    applyDelta(state, { stats: { physical: -100 } });
    expect(state.training!.stats.physical).toBe(0);
  });

  test("statMax delta raises the cap", () => {
    const state = createInitialState(makeTrainingGame());
    applyDelta(state, { statMax: { physical: 5 } });
    expect(state.training!.statMax.physical).toBe(25);
    applyDelta(state, { stats: { physical: 100 } });
    expect(state.training!.stats.physical).toBe(25);
  });

  test("stats delta is a no-op without training state", () => {
    const state = makeState();
    expect(() =>
      applyDelta(state, { stats: { spectral: 5 } }),
    ).not.toThrow();
    expect(state.training).toBeUndefined();
  });
});

describe("createInitialState", () => {
  test("seeds character affection from defaultAffection", () => {
    const game = makeGame({
      characters: [
        makeCharacter("alice", { defaultAffection: 2 }),
        makeCharacter("bob"),
      ],
    });
    const state = createInitialState(game);
    expect(state.baseline.characters.alice!.affection).toBe(2);
    expect(state.baseline.characters.bob!.affection).toBe(0);
  });

  test("creates fresh runtime + baseline slices", () => {
    const state = makeState();
    expect(state.baseline).toBeDefined();
    expect(state.baseline.flags).toEqual({});
    expect(state.baseline.completedScripts).toEqual([]);
    expect(state.baseline.inventory).toEqual({});
    expect(state.runtime.pendingNarrations).toEqual([]);
    expect(state.runtime.activeTriggers).toEqual([]);
    expect(state.runtime.firedTriggers).toEqual([]);
  });

  test("accepts a bare character array (legacy overload)", () => {
    const state = createInitialState([makeCharacter("alice")]);
    expect(state.baseline.characters.alice).toBeDefined();
  });
});

// Sanity check that test-utils don't import anything that breaks the
// engine package. If this import chain ever cycles, this test will
// surface it before the others run.
test("test-utils make a usable game", () => {
  const game = makeGame({
    characters: [makeCharacter("alice")],
    actions: [makeAction("rest")],
  });
  expect(game.title).toBe("test");
  expect(game.actions).toHaveLength(1);
});
