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
    fixture.state = obj.state as Partial<ComposedState>;
  }
  if (typeof obj.maxSteps === "number") fixture.maxSteps = obj.maxSteps;
  return fixture;
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
