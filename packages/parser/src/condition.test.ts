import { describe, expect, test } from "bun:test";
import { ConditionParseError, parseCondition } from "./condition";

describe("parseCondition — undefined/null", () => {
  test("undefined input returns undefined (no requires)", () => {
    expect(parseCondition(undefined)).toBeUndefined();
  });

  test("null input returns undefined", () => {
    expect(parseCondition(null)).toBeUndefined();
  });

  test("non-object throws", () => {
    expect(() => parseCondition("foo")).toThrow(ConditionParseError);
    expect(() => parseCondition(42)).toThrow(ConditionParseError);
  });
});

describe("parseCondition — leaf shapes", () => {
  test("scriptCompleted", () => {
    expect(parseCondition({ scriptCompleted: "001" })).toEqual({
      scriptCompleted: "001",
    });
  });

  test("scriptCompleted requires string", () => {
    expect(() => parseCondition({ scriptCompleted: 42 })).toThrow(
      /scriptCompleted/,
    );
  });

  test("affection with all range fields", () => {
    expect(
      parseCondition({
        affection: { character: "alice", min: 2, max: 5, eq: 3 },
      }),
    ).toEqual({
      affection: { character: "alice", min: 2, max: 5, eq: 3 },
    });
  });

  test("affection drops non-number range fields", () => {
    expect(
      parseCondition({
        affection: { character: "alice", min: "2", max: 5 },
      }),
    ).toEqual({ affection: { character: "alice", max: 5 } });
  });

  test("affection requires character string", () => {
    expect(() => parseCondition({ affection: { min: 1 } })).toThrow(
      /affection.character/,
    );
  });

  test("variable with eq (string)", () => {
    expect(
      parseCondition({ variable: { name: "route", eq: "alice" } }),
    ).toEqual({ variable: { name: "route", eq: "alice" } });
  });

  test("switch with eq (boolean)", () => {
    expect(
      parseCondition({ switch: { name: "unlocked", eq: true } }),
    ).toEqual({ switch: { name: "unlocked", eq: true } });
  });

  test("switch without eq (bare reference, defaults to true at eval)", () => {
    expect(parseCondition({ switch: { name: "unlocked" } })).toEqual({
      switch: { name: "unlocked" },
    });
  });

  test("variable with min/max numbers", () => {
    expect(
      parseCondition({ variable: { name: "gold", min: 5 } }),
    ).toEqual({ variable: { name: "gold", min: 5 } });
  });

  test("variable requires name", () => {
    expect(() => parseCondition({ variable: {} })).toThrow(/variable.name/);
  });

  test("switch requires name", () => {
    expect(() => parseCondition({ switch: {} })).toThrow(/switch.name/);
  });

  test("stat", () => {
    expect(
      parseCondition({ stat: { name: "spectral", min: 50 } }),
    ).toEqual({ stat: { name: "spectral", min: 50 } });
  });

  test("inventory", () => {
    expect(
      parseCondition({ inventory: { itemId: "potion", min: 1 } }),
    ).toEqual({ inventory: { itemId: "potion", min: 1 } });
  });

  test("weaponPower", () => {
    expect(
      parseCondition({ weaponPower: { weaponId: "yaodao", min: 10 } }),
    ).toEqual({ weaponPower: { weaponId: "yaodao", min: 10 } });
  });

  test("knowsSkill", () => {
    expect(parseCondition({ knowsSkill: "purify" })).toEqual({
      knowsSkill: "purify",
    });
  });

  test("day", () => {
    expect(parseCondition({ day: { min: 1, max: 14 } })).toEqual({
      day: { min: 1, max: 14 },
    });
  });

  test("slot", () => {
    expect(parseCondition({ slot: { eq: 2 } })).toEqual({
      slot: { eq: 2 },
    });
  });
});

describe("parseCondition — composite", () => {
  test("all", () => {
    expect(
      parseCondition({
        all: [{ scriptCompleted: "001" }, { scriptCompleted: "002" }],
      }),
    ).toEqual({
      all: [{ scriptCompleted: "001" }, { scriptCompleted: "002" }],
    });
  });

  test("all requires array", () => {
    expect(() =>
      parseCondition({ all: { scriptCompleted: "001" } }),
    ).toThrow(/`all` must be an array/);
  });

  test("any", () => {
    expect(
      parseCondition({
        any: [{ switch: { name: "x", eq: true } }],
      }),
    ).toEqual({ any: [{ switch: { name: "x", eq: true } }] });
  });

  test("any requires array", () => {
    expect(() => parseCondition({ any: 5 })).toThrow(
      /`any` must be an array/,
    );
  });

  test("not", () => {
    expect(parseCondition({ not: { scriptCompleted: "001" } })).toEqual({
      not: { scriptCompleted: "001" },
    });
  });

  test("nested all > any > not", () => {
    const cond = parseCondition({
      all: [
        {
          any: [
            { variable: { name: "route", eq: "alice" } },
            { variable: { name: "route", eq: "bea" } },
          ],
        },
        { not: { scriptCompleted: "001" } },
      ],
    });
    expect(cond).toBeDefined();
    expect("all" in cond!).toBe(true);
  });

  test("empty nested condition throws", () => {
    expect(() => parseCondition({ not: null })).toThrow(
      /Nested condition cannot be empty/,
    );
  });
});

describe("parseCondition — unknown shape", () => {
  test("throws with key list in message", () => {
    expect(() => parseCondition({ foobar: 1, baz: 2 })).toThrow(
      /Unknown condition shape.*foobar.*baz/,
    );
  });
});
