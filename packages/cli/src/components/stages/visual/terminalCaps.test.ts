import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { detect, getColorLevel, resetColorLevelCache } from "./terminalCaps";

const SAVED_KEYS = [
  "NO_COLOR",
  "FORCE_COLOR",
  "COLORTERM",
  "TERM",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of SAVED_KEYS) saved[k] = process.env[k];
  for (const k of SAVED_KEYS) delete process.env[k];
  resetColorLevelCache();
});
afterEach(() => {
  for (const k of SAVED_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetColorLevelCache();
});

describe("detect()", () => {
  test("NO_COLOR=1 → none, regardless of COLORTERM", () => {
    process.env.NO_COLOR = "1";
    process.env.COLORTERM = "truecolor";
    expect(detect()).toBe("none");
  });

  test("empty NO_COLOR is ignored (community convention)", () => {
    process.env.NO_COLOR = "";
    process.env.COLORTERM = "truecolor";
    expect(detect()).toBe("truecolor");
  });

  test("FORCE_COLOR=0 → none", () => {
    process.env.FORCE_COLOR = "0";
    process.env.COLORTERM = "truecolor";
    expect(detect()).toBe("none");
  });

  test("FORCE_COLOR=3 → truecolor (overrides absence of COLORTERM)", () => {
    process.env.FORCE_COLOR = "3";
    expect(detect()).toBe("truecolor");
  });

  test("FORCE_COLOR=2 → 256", () => {
    process.env.FORCE_COLOR = "2";
    expect(detect()).toBe("256");
  });

  test("FORCE_COLOR=1 → 16", () => {
    process.env.FORCE_COLOR = "1";
    expect(detect()).toBe("16");
  });

  test("TERM=dumb → none", () => {
    process.env.TERM = "dumb";
    expect(detect()).toBe("none");
  });

  test("COLORTERM=truecolor → truecolor", () => {
    process.env.COLORTERM = "truecolor";
    expect(detect()).toBe("truecolor");
  });

  test("COLORTERM=24bit → truecolor", () => {
    process.env.COLORTERM = "24bit";
    expect(detect()).toBe("truecolor");
  });

  test("TERM=xterm-256color → 256", () => {
    process.env.TERM = "xterm-256color";
    expect(detect()).toBe("256");
  });

  test("TERM=tmux-256color → 256", () => {
    process.env.TERM = "tmux-256color";
    expect(detect()).toBe("256");
  });

  test("TERM=xterm → 16 (basic ANSI baseline)", () => {
    process.env.TERM = "xterm";
    expect(detect()).toBe("16");
  });

  test("no env vars at all → 16 (baseline)", () => {
    expect(detect()).toBe("16");
  });
});

describe("getColorLevel()", () => {
  test("caches across calls", () => {
    process.env.COLORTERM = "truecolor";
    expect(getColorLevel()).toBe("truecolor");
    // Mutate env after caching — should still return cached value
    delete process.env.COLORTERM;
    process.env.NO_COLOR = "1";
    expect(getColorLevel()).toBe("truecolor");
  });

  test("resetColorLevelCache forces re-detect", () => {
    process.env.COLORTERM = "truecolor";
    expect(getColorLevel()).toBe("truecolor");
    delete process.env.COLORTERM;
    process.env.NO_COLOR = "1";
    resetColorLevelCache();
    expect(getColorLevel()).toBe("none");
  });
});
