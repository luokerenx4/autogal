import type { Condition, FlagValue } from "@autogal/engine";

export class ConditionParseError extends Error {}

export function parseCondition(raw: unknown): Condition | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new ConditionParseError(`Expected object, got ${typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;

  if ("all" in obj) {
    if (!Array.isArray(obj.all)) {
      throw new ConditionParseError("`all` must be an array");
    }
    return { all: obj.all.map((c) => parseConditionRequired(c)) };
  }
  if ("any" in obj) {
    if (!Array.isArray(obj.any)) {
      throw new ConditionParseError("`any` must be an array");
    }
    return { any: obj.any.map((c) => parseConditionRequired(c)) };
  }
  if ("not" in obj) {
    return { not: parseConditionRequired(obj.not) };
  }
  if ("scriptCompleted" in obj) {
    if (typeof obj.scriptCompleted !== "string") {
      throw new ConditionParseError("`scriptCompleted` must be a string");
    }
    return { scriptCompleted: obj.scriptCompleted };
  }
  if ("affection" in obj) {
    const a = obj.affection as Record<string, unknown> | undefined;
    if (!a || typeof a !== "object") {
      throw new ConditionParseError("`affection` must be an object");
    }
    if (typeof a.character !== "string") {
      throw new ConditionParseError("`affection.character` must be a string");
    }
    return {
      affection: {
        character: a.character,
        ...(typeof a.min === "number" ? { min: a.min } : {}),
        ...(typeof a.max === "number" ? { max: a.max } : {}),
        ...(typeof a.eq === "number" ? { eq: a.eq } : {}),
      },
    };
  }
  if ("flag" in obj) {
    const f = obj.flag as Record<string, unknown> | undefined;
    if (!f || typeof f !== "object") {
      throw new ConditionParseError("`flag` must be an object");
    }
    if (typeof f.name !== "string") {
      throw new ConditionParseError("`flag.name` must be a string");
    }
    return {
      flag: {
        name: f.name,
        ...(f.eq !== undefined ? { eq: f.eq as FlagValue } : {}),
        ...(typeof f.min === "number" ? { min: f.min } : {}),
        ...(typeof f.max === "number" ? { max: f.max } : {}),
      },
    };
  }
  throw new ConditionParseError(
    `Unknown condition shape. Keys: ${Object.keys(obj).join(", ")}`,
  );
}

function parseConditionRequired(raw: unknown): Condition {
  const c = parseCondition(raw);
  if (c === undefined) {
    throw new ConditionParseError("Nested condition cannot be empty");
  }
  return c;
}
