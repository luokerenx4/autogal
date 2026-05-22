import type { LoopResult, Output } from "@autogal/engine";
import type { Assertion } from "./fixture";

export interface AssertionFailure {
  index: number;
  assertion: Assertion;
  message: string;
}

export function runAssertions(
  result: LoopResult,
  assertions: Assertion[],
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  for (let i = 0; i < assertions.length; i++) {
    const a = assertions[i];
    if (!a) continue;
    const failure = checkAssertion(result, a);
    if (failure) failures.push({ index: i, assertion: a, message: failure });
  }
  return failures;
}

function checkAssertion(result: LoopResult, a: Assertion): string | null {
  switch (a.kind) {
    case "reason":
      if (result.reason !== a.eq) {
        return `expected reason=${a.eq}, got ${result.reason}${
          result.error ? ` (error: ${result.error})` : ""
        }`;
      }
      return null;
    case "state":
      return checkState(result, a);
    case "output":
      return checkOutput(result.trace.map((t) => t.output), a);
  }
}

function checkState(
  result: LoopResult,
  a: Extract<Assertion, { kind: "state" }>,
): string | null {
  const value = readPath(result.finalState, a.path);
  if (a.eq !== undefined && !deepEqual(value, a.eq)) {
    return `state.${a.path}: expected ${JSON.stringify(a.eq)}, got ${JSON.stringify(value)}`;
  }
  if (a.gte !== undefined) {
    if (typeof value !== "number" || value < a.gte) {
      return `state.${a.path}: expected >= ${a.gte}, got ${JSON.stringify(value)}`;
    }
  }
  if (a.lte !== undefined) {
    if (typeof value !== "number" || value > a.lte) {
      return `state.${a.path}: expected <= ${a.lte}, got ${JSON.stringify(value)}`;
    }
  }
  if (a.includes !== undefined) {
    if (!Array.isArray(value) || !value.some((v) => deepEqual(v, a.includes))) {
      return `state.${a.path}: expected to include ${JSON.stringify(a.includes)}, got ${JSON.stringify(value)}`;
    }
  }
  if (a.length !== undefined) {
    const len = Array.isArray(value)
      ? value.length
      : typeof value === "string"
        ? value.length
        : null;
    if (len === null) {
      return `state.${a.path}: expected length but value is not array/string: ${JSON.stringify(value)}`;
    }
    if (len !== a.length) {
      return `state.${a.path}: expected length ${a.length}, got ${len}`;
    }
  }
  return null;
}

function checkOutput(
  outputs: Output[],
  a: Extract<Assertion, { kind: "output" }>,
): string | null {
  const matches = outputs.filter((o) => {
    if (o.type !== a.type) return false;
    if (a.speaker !== undefined) {
      if (o.type !== "dialogue") return false;
      if (o.speakerId !== a.speaker) return false;
    }
    if (a.textIncludes !== undefined) {
      const text =
        o.type === "narration"
          ? o.text
          : o.type === "dialogue"
            ? o.text
            : null;
      if (typeof text !== "string" || !text.includes(a.textIncludes)) {
        return false;
      }
    }
    return true;
  });
  const found = matches.length > 0;
  if (a.present && !found) {
    return `expected at least one output matching type=${a.type}${
      a.textIncludes ? ` textIncludes=${a.textIncludes}` : ""
    }`;
  }
  if (!a.present && found) {
    return `expected no output matching type=${a.type}${
      a.textIncludes ? ` textIncludes=${a.textIncludes}` : ""
    }, but found ${matches.length}`;
  }
  return null;
}

function readPath(obj: unknown, path: string): unknown {
  // Phase 2 legacy-path alias: `baseline.completedScripts` now lives at
  // `baseline.completionOrder` (an ordered list of completed script ids).
  // Existing fixtures continue to assert against the old path until they're
  // rewritten, so transparently rewrite the alias here.
  if (path === "baseline.completedScripts") {
    return readPath(obj, "baseline.completionOrder");
  }
  const parts = path.split(".");
  let cursor: unknown = obj;
  for (const p of parts) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[p];
  }
  return cursor;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao);
  if (keys.length !== Object.keys(bo).length) return false;
  return keys.every((k) => deepEqual(ao[k], bo[k]));
}
