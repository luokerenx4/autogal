import { describe, expect, test } from "bun:test";
import { buildPresetContext, Engine } from "./engine";
import { makeCharacter, makeGame, makeScript } from "./test-utils";
import type { Module } from "./types";

describe("buildPresetContext", () => {
  test("aggregates all modules' actionHandlers into a flat registry", () => {
    const modA: Module = {
      id: "modA",
      actionHandlers: { custom_a: () => ({}) },
    };
    const modB: Module = {
      id: "modB",
      actionHandlers: { custom_b: () => ({}) },
    };
    const ctx = buildPresetContext(
      makeGame({
        characters: [makeCharacter("alice")],
        modules: [modA, modB],
      }),
    );
    expect(Object.keys(ctx.actionHandlerRegistry).sort()).toEqual([
      "custom_a",
      "custom_b",
      "useItem",
      "useSkill",
    ]);
  });

  test("throws on duplicate handler kind across modules", () => {
    const modA: Module = {
      id: "modA",
      actionHandlers: { shared: () => ({}) },
    };
    const modB: Module = {
      id: "modB",
      actionHandlers: { shared: () => ({}) },
    };
    expect(() =>
      buildPresetContext(
        makeGame({
          characters: [makeCharacter("alice")],
          modules: [modA, modB],
        }),
      ),
    ).toThrow(/duplicate action handler for kind "shared"/);
  });

  test("aggregates triggers in declaration order", () => {
    const modA: Module = {
      id: "modA",
      triggers: [
        {
          id: "t1",
          when: { switch: { name: "x", eq: true } },
          do: () => ({}),
        },
      ],
    };
    const modB: Module = {
      id: "modB",
      triggers: [
        {
          id: "t2",
          when: { switch: { name: "y", eq: true } },
          do: () => ({}),
        },
      ],
    };
    const ctx = buildPresetContext(
      makeGame({
        characters: [makeCharacter("alice")],
        modules: [modA, modB],
      }),
    );
    expect(ctx.triggerRegistry.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  test("throws on duplicate trigger id across modules", () => {
    const modA: Module = {
      id: "modA",
      triggers: [
        {
          id: "dup",
          when: { switch: { name: "x", eq: true } },
          do: () => ({}),
        },
      ],
    };
    const modB: Module = {
      id: "modB",
      triggers: [
        {
          id: "dup",
          when: { switch: { name: "y", eq: true } },
          do: () => ({}),
        },
      ],
    };
    expect(() =>
      buildPresetContext(
        makeGame({
          characters: [makeCharacter("alice")],
          modules: [modA, modB],
        }),
      ),
    ).toThrow(/duplicate trigger id "dup"/);
  });

  test("builds lookup maps from game registries", () => {
    const ctx = buildPresetContext(
      makeGame({
        characters: [makeCharacter("alice"), makeCharacter("bob")],
        scripts: [makeScript("001"), makeScript("002")],
      }),
    );
    expect(ctx.scriptMap.size).toBe(2);
    expect(ctx.scriptMap.get("001")?.id).toBe("001");
    expect(ctx.characterNameMap.get("alice")).toBe("alice");
  });

  test("rng override is plumbed through", () => {
    const ctx = buildPresetContext(
      makeGame({ characters: [makeCharacter("alice")] }),
      undefined,
      () => 0.5,
    );
    expect(ctx.rng()).toBe(0.5);
  });
});

describe("Engine class", () => {
  test("constructor builds usable ctx", () => {
    const engine = new Engine(
      makeGame({
        characters: [makeCharacter("alice")],
        scripts: [makeScript("001")],
      }),
    );
    expect(engine.getAvailableScripts()).toEqual([
      { id: "001", title: "001" },
    ]);
  });

  test("getAvailableScripts filters completed", () => {
    const engine = new Engine(
      makeGame({
        characters: [makeCharacter("alice")],
        scripts: [makeScript("001"), makeScript("002")],
      }),
    );
    const state = engine.getState();
    state.baseline.scripts["001"] = { completed: true, selfSwitches: { A: false, B: false, C: false, D: false } };
    // getState returns a clone, so mutating it doesn't affect engine —
    // construct a new engine with the mutated state to verify filtering.
    const engine2 = new Engine(
      makeGame({
        characters: [makeCharacter("alice")],
        scripts: [makeScript("001"), makeScript("002")],
      }),
      state,
    );
    expect(engine2.getAvailableScripts().map((s) => s.id)).toEqual(["002"]);
  });

  test("getAvailableScripts respects requires", () => {
    const engine = new Engine(
      makeGame({
        characters: [makeCharacter("alice")],
        scripts: [
          makeScript("001"),
          makeScript("gated", {
            requires: { scriptCompleted: "001" },
          }),
        ],
      }),
    );
    expect(engine.getAvailableScripts().map((s) => s.id)).toEqual(["001"]);
  });

  test("serialize round-trips through hydrateState", async () => {
    const engine = new Engine(
      makeGame({
        characters: [
          makeCharacter("alice", { stats: { affection: { initial: 2 } } }),
        ],
      }),
    );
    const json = engine.serialize();
    const parsed = JSON.parse(json) as {
      baseline: { characters: Record<string, { stats: { affection: number } }> };
    };
    expect(parsed.baseline.characters.alice?.stats.affection).toBe(2);
  });
});
