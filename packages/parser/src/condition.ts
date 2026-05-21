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
  if ("stat" in obj) {
    const s = obj.stat as Record<string, unknown> | undefined;
    if (!s || typeof s !== "object") {
      throw new ConditionParseError("`stat` must be an object");
    }
    if (typeof s.name !== "string") {
      throw new ConditionParseError("`stat.name` must be a string");
    }
    return {
      stat: {
        name: s.name,
        ...(typeof s.min === "number" ? { min: s.min } : {}),
        ...(typeof s.max === "number" ? { max: s.max } : {}),
        ...(typeof s.eq === "number" ? { eq: s.eq } : {}),
      },
    };
  }
  if ("inventory" in obj) {
    const i = obj.inventory as Record<string, unknown> | undefined;
    if (!i || typeof i !== "object") {
      throw new ConditionParseError("`inventory` must be an object");
    }
    if (typeof i.itemId !== "string") {
      throw new ConditionParseError("`inventory.itemId` must be a string");
    }
    return {
      inventory: {
        itemId: i.itemId,
        ...(typeof i.min === "number" ? { min: i.min } : {}),
        ...(typeof i.max === "number" ? { max: i.max } : {}),
        ...(typeof i.eq === "number" ? { eq: i.eq } : {}),
      },
    };
  }
  if ("weaponPower" in obj) {
    const w = obj.weaponPower as Record<string, unknown> | undefined;
    if (!w || typeof w !== "object") {
      throw new ConditionParseError("`weaponPower` must be an object");
    }
    if (typeof w.weaponId !== "string") {
      throw new ConditionParseError("`weaponPower.weaponId` must be a string");
    }
    return {
      weaponPower: {
        weaponId: w.weaponId,
        ...(typeof w.min === "number" ? { min: w.min } : {}),
        ...(typeof w.max === "number" ? { max: w.max } : {}),
        ...(typeof w.eq === "number" ? { eq: w.eq } : {}),
      },
    };
  }
  if ("day" in obj) {
    const d = obj.day as Record<string, unknown>;
    if (!d || typeof d !== "object") {
      throw new ConditionParseError("`day` must be an object");
    }
    return {
      day: {
        ...(typeof d.min === "number" ? { min: d.min } : {}),
        ...(typeof d.max === "number" ? { max: d.max } : {}),
        ...(typeof d.eq === "number" ? { eq: d.eq } : {}),
      },
    };
  }
  if ("slot" in obj) {
    const s = obj.slot as Record<string, unknown>;
    if (!s || typeof s !== "object") {
      throw new ConditionParseError("`slot` must be an object");
    }
    return {
      slot: {
        ...(typeof s.min === "number" ? { min: s.min } : {}),
        ...(typeof s.max === "number" ? { max: s.max } : {}),
        ...(typeof s.eq === "number" ? { eq: s.eq } : {}),
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
