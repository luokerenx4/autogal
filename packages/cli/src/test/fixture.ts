import { parse as parseYaml } from "yaml";
import type { ComposedState, Input } from "@autogal/engine";

export type Assertion =
  | ReasonAssertion
  | StateAssertion
  | OutputAssertion;

export interface ReasonAssertion {
  kind: "reason";
  eq: string;
}

export interface StateAssertion {
  kind: "state";
  path: string;
  eq?: unknown;
  gte?: number;
  lte?: number;
  includes?: unknown;
  length?: number;
}

export interface OutputAssertion {
  kind: "output";
  type: string;
  present: boolean;
  speaker?: string;
  textIncludes?: string;
}

export interface Fixture {
  name: string;
  description?: string;
  state?: Partial<ComposedState>;
  inputs: Input[];
  assertions: Assertion[];
  maxSteps?: number;
}

export class FixtureParseError extends Error {}

export function parseFixture(content: string, source?: string): Fixture {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new FixtureParseError(
      `${source ?? "fixture"}: invalid YAML — ${(err as Error).message}`,
    );
  }
  if (!raw || typeof raw !== "object") {
    throw new FixtureParseError(
      `${source ?? "fixture"}: must be a YAML object`,
    );
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string") {
    throw new FixtureParseError(`${source ?? "fixture"}: missing \`name\``);
  }
  if (!Array.isArray(obj.inputs)) {
    throw new FixtureParseError(
      `${source ?? "fixture"}: \`inputs\` must be an array`,
    );
  }
  if (!Array.isArray(obj.assertions)) {
    throw new FixtureParseError(
      `${source ?? "fixture"}: \`assertions\` must be an array`,
    );
  }
  const fixture: Fixture = {
    name: obj.name,
    inputs: obj.inputs as Input[],
    assertions: obj.assertions as Assertion[],
  };
  if (typeof obj.description === "string") fixture.description = obj.description;
  if (obj.state && typeof obj.state === "object") {
    fixture.state = expandSeedSugar(obj.state as Partial<ComposedState>);
  }
  if (typeof obj.maxSteps === "number") fixture.maxSteps = obj.maxSteps;
  return fixture;
}

// Fixture-loader sugar. The engine state shape doesn't have a flat
// `completedScripts: string[]` field anymore (Phase 2: it's
// `scripts: Record<id, ScriptState>` + `completionOrder: string[]`).
// To keep test fixtures readable, the loader accepts the legacy
// shorthand `baseline.completedScripts: [a, b, c]` and expands it
// into the new shape before merging into the engine's initial state.
// Authors writing new fixtures can use either form.
function expandSeedSugar(
  raw: Partial<ComposedState>,
): Partial<ComposedState> {
  const baseline = (raw as { baseline?: Record<string, unknown> }).baseline;
  if (!baseline) return raw;
  const legacyList = baseline.completedScripts;
  if (!Array.isArray(legacyList)) return raw;
  const expanded: Record<string, unknown> = {
    completed: true,
    selfSwitches: { A: false, B: false, C: false, D: false },
  };
  const scriptsRecord: Record<string, unknown> = {
    ...((baseline.scripts as Record<string, unknown>) ?? {}),
  };
  for (const id of legacyList) {
    if (typeof id === "string" && !scriptsRecord[id]) {
      scriptsRecord[id] = expanded;
    }
  }
  const order = Array.isArray(baseline.completionOrder)
    ? [...(baseline.completionOrder as unknown[])]
    : [];
  for (const id of legacyList) {
    if (typeof id === "string" && !order.includes(id)) order.push(id);
  }
  const { completedScripts: _stripped, ...restBaseline } = baseline as {
    completedScripts?: unknown;
    [k: string]: unknown;
  };
  return {
    ...raw,
    baseline: {
      ...restBaseline,
      scripts: scriptsRecord,
      completionOrder: order,
    },
  } as Partial<ComposedState>;
}

export function mergeState(
  base: ComposedState,
  overrides: Partial<ComposedState> | undefined,
): ComposedState {
  if (!overrides) return base;
  const result = structuredClone(base);
  for (const [ns, slice] of Object.entries(overrides)) {
    const existing = (result as Record<string, unknown>)[ns];
    if (
      existing &&
      typeof existing === "object" &&
      slice &&
      typeof slice === "object" &&
      !Array.isArray(slice) &&
      !Array.isArray(existing)
    ) {
      (result as Record<string, unknown>)[ns] = deepMerge(
        existing as Record<string, unknown>,
        slice as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[ns] = slice as unknown;
    }
  }
  return result;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      result[k] &&
      typeof result[k] === "object" &&
      !Array.isArray(result[k])
    ) {
      result[k] = deepMerge(
        result[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      result[k] = v;
    }
  }
  return result;
}
