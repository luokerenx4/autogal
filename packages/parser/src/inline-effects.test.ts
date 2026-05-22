import { describe, expect, test } from "bun:test";
import { parseInlineEffects } from "./inline-effects";

describe("parseInlineEffects", () => {
  test("+alice → characterStats.alice.affection +1", () => {
    expect(parseInlineEffects("+alice")).toEqual({
      characterStats: { alice: { affection: 1 } },
    });
  });

  test("-alice → affection -1", () => {
    expect(parseInlineEffects("-alice")).toEqual({
      characterStats: { alice: { affection: -1 } },
    });
  });

  test("+2alice → affection +2", () => {
    expect(parseInlineEffects("+2alice")).toEqual({
      characterStats: { alice: { affection: 2 } },
    });
  });

  test("-3bea → affection -3", () => {
    expect(parseInlineEffects("-3bea")).toEqual({
      characterStats: { bea: { affection: -3 } },
    });
  });

  test("multiple tokens sum into one delta", () => {
    expect(parseInlineEffects("+alice -bea")).toEqual({
      characterStats: { alice: { affection: 1 }, bea: { affection: -1 } },
    });
  });

  test("repeated tokens for same character sum", () => {
    expect(parseInlineEffects("+alice +alice")).toEqual({
      characterStats: { alice: { affection: 2 } },
    });
  });

  test("non-matching tokens are skipped", () => {
    expect(parseInlineEffects("+alice goto leave -bea")).toEqual({
      characterStats: { alice: { affection: 1 }, bea: { affection: -1 } },
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
      characterStats: { alice_friend: { affection: 1 } },
    });
  });

  test("explicit stat suffix: +alice.trust", () => {
    expect(parseInlineEffects("+alice.trust")).toEqual({
      characterStats: { alice: { trust: 1 } },
    });
  });

  test("magnitude + suffix: -2alice.anger", () => {
    expect(parseInlineEffects("-2alice.anger")).toEqual({
      characterStats: { alice: { anger: -2 } },
    });
  });

  test("mixed: +alice +alice.trust -2bea", () => {
    expect(parseInlineEffects("+alice +alice.trust -2bea")).toEqual({
      characterStats: {
        alice: { affection: 1, trust: 1 },
        bea: { affection: -2 },
      },
    });
  });
});
