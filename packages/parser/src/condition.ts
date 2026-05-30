import type { Condition, VariableValue } from "@rpg-harness/engine";

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
  if ("selfSwitch" in obj) {
    const s = obj.selfSwitch as Record<string, unknown> | undefined;
    if (!s || typeof s !== "object") {
      throw new ConditionParseError("`selfSwitch` must be an object");
    }
    if (typeof s.scriptId !== "string") {
      throw new ConditionParseError("`selfSwitch.scriptId` must be a string");
    }
    if (s.name !== "A" && s.name !== "B" && s.name !== "C" && s.name !== "D") {
      throw new ConditionParseError(
        `\`selfSwitch.name\` must be one of "A" | "B" | "C" | "D" (got ${JSON.stringify(s.name)})`,
      );
    }
    return {
      selfSwitch: {
        scriptId: s.scriptId,
        name: s.name,
        ...(typeof s.eq === "boolean" ? { eq: s.eq } : {}),
      },
    };
  }
  if ("affection" in obj) {
    // Sugar variant: kept verbatim in the AST since the Condition type
    // accepts both `affection: { character, ... }` and `characterStat:
    // { character, name, ... }`. The evaluator treats them identically.
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
  if ("characterStat" in obj) {
    const a = obj.characterStat as Record<string, unknown> | undefined;
    if (!a || typeof a !== "object") {
      throw new ConditionParseError("`characterStat` must be an object");
    }
    if (typeof a.character !== "string") {
      throw new ConditionParseError(
        "`characterStat.character` must be a string",
      );
    }
    if (typeof a.name !== "string") {
      throw new ConditionParseError("`characterStat.name` must be a string");
    }
    return {
      characterStat: {
        character: a.character,
        name: a.name,
        ...(typeof a.min === "number" ? { min: a.min } : {}),
        ...(typeof a.max === "number" ? { max: a.max } : {}),
        ...(typeof a.eq === "number" ? { eq: a.eq } : {}),
      },
    };
  }
  if ("switch" in obj) {
    const f = obj.switch as Record<string, unknown> | undefined;
    if (!f || typeof f !== "object") {
      throw new ConditionParseError("`switch` must be an object");
    }
    if (typeof f.name !== "string") {
      throw new ConditionParseError("`switch.name` must be a string");
    }
    return {
      switch: {
        name: f.name,
        ...(typeof f.eq === "boolean" ? { eq: f.eq } : {}),
      },
    };
  }
  if ("variable" in obj) {
    const f = obj.variable as Record<string, unknown> | undefined;
    if (!f || typeof f !== "object") {
      throw new ConditionParseError("`variable` must be an object");
    }
    if (typeof f.name !== "string") {
      throw new ConditionParseError("`variable.name` must be a string");
    }
    return {
      variable: {
        name: f.name,
        ...(f.eq !== undefined ? { eq: f.eq as VariableValue } : {}),
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
  if ("knowsSkill" in obj) {
    if (typeof obj.knowsSkill !== "string") {
      throw new ConditionParseError("`knowsSkill` must be a string");
    }
    return { knowsSkill: obj.knowsSkill };
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
