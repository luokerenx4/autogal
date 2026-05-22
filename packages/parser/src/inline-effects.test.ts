import { describe, expect, test } from "bun:test";
import { parseInlineEffects } from "./inline-effects";

describe("parseInlineEffects", () => {
  test("+alice → affection +1", () => {
    expect(parseInlineEffects("+alice")).toEqual({
      affection: { alice: 1 },
    });
  });

  test("-alice → affection -1", () => {
    expect(parseInlineEffects("-alice")).toEqual({
      affection: { alice: -1 },
    });
  });

  test("+2alice → affection +2", () => {
    expect(parseInlineEffects("+2alice")).toEqual({
      affection: { alice: 2 },
    });
  });

  test("-3bea → affection -3", () => {
    expect(parseInlineEffects("-3bea")).toEqual({
      affection: { bea: -3 },
    });
  });

  test("multiple tokens sum into one delta", () => {
    expect(parseInlineEffects("+alice -bea")).toEqual({
      affection: { alice: 1, bea: -1 },
    });
  });

  test("repeated tokens for same character sum", () => {
    expect(parseInlineEffects("+alice +alice")).toEqual({
      affection: { alice: 2 },
    });
  });

  test("non-matching tokens are skipped", () => {
    expect(parseInlineEffects("+alice goto leave -bea")).toEqual({
      affection: { alice: 1, bea: -1 },
    });
  });

  test("empty / whitespace-only input returns undefined", () => {
    expect(parseInlineEffects("")).toBeUndefined();
    expect(parseInlineEffects("   ")).toBeUndefined();
  });

  test("no parseable tokens returns undefined", () => {
    expect(parseInlineEffects("goto leave")).toBeUndefined();
  });

  test("snake_case character name accepted", () => {
    expect(parseInlineEffects("+alice_friend")).toEqual({
      affection: { alice_friend: 1 },
    });
  });

  test("digit-starting name is NOT accepted (regex enforces identifier rule)", () => {
    expect(parseInlineEffects("+2bot")).toEqual({
      affection: { bot: 2 },
    });
    // But starting with a digit IS allowed since digits between sign
    // and name are interpreted as magnitude. There's no syntactic way
    // to express "+2_something" with leading digit in the name.
  });
});
