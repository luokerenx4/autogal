import { parse as parseYaml } from "yaml";
import type { EndConditionSpec, StatDef, TrainingConfig } from "@autogal/engine";
import { parseCondition } from "./condition";

export interface Manifest {
  title: string;
  training?: TrainingConfig;
}

export class ManifestParseError extends Error {}

export function parseManifest(content: string): Manifest {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new ManifestParseError(
      `Invalid YAML in game manifest: ${(err as Error).message}`,
    );
  }
  if (!raw || typeof raw !== "object") {
    throw new ManifestParseError("Manifest must be a YAML object");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    throw new ManifestParseError("Manifest missing `title`");
  }
  const manifest: Manifest = { title: obj.title };
  if (obj.training !== undefined) {
    manifest.training = parseTraining(obj.training);
  }
  return manifest;
}

function parseTraining(raw: unknown): TrainingConfig {
  if (!raw || typeof raw !== "object") {
    throw new ManifestParseError("`training` must be an object");
  }
  const t = raw as Record<string, unknown>;
  const slotsPerDay = numberField(t, "slotsPerDay", 3);
  const slotNames = arrayOfStrings(t, "slotNames", ["上午", "下午", "晚上"]);
  const startDay = numberField(t, "startDay", 1);
  const maxDay = numberField(t, "maxDay", 14);
  const decayPerDay = numberField(t, "decayPerDay", 0);
  const decayStatId =
    typeof t.decayStatId === "string" ? t.decayStatId : "";
  const sleepActionId =
    typeof t.sleepActionId === "string" ? t.sleepActionId : "sleep";
  const huntActionId =
    typeof t.huntActionId === "string" ? t.huntActionId : "hunt";

  const statsRaw = t.stats;
  if (!Array.isArray(statsRaw)) {
    throw new ManifestParseError("`training.stats` must be an array");
  }
  const stats: StatDef[] = statsRaw.map((s, i) => {
    if (!s || typeof s !== "object") {
      throw new ManifestParseError(`stats[${i}] must be an object`);
    }
    const obj = s as Record<string, unknown>;
    if (typeof obj.id !== "string") {
      throw new ManifestParseError(`stats[${i}].id must be a string`);
    }
    return {
      id: obj.id,
      name: typeof obj.name === "string" ? obj.name : obj.id,
      min: typeof obj.min === "number" ? obj.min : 0,
      max: typeof obj.max === "number" ? obj.max : 100,
      start: typeof obj.start === "number" ? obj.start : 0,
    };
  });

  const endRaw = t.endConditions;
  if (!Array.isArray(endRaw)) {
    throw new ManifestParseError(
      "`training.endConditions` must be an array",
    );
  }
  const endConditions: EndConditionSpec[] = endRaw.map((e, i) => {
    if (!e || typeof e !== "object") {
      throw new ManifestParseError(`endConditions[${i}] must be an object`);
    }
    const obj = e as Record<string, unknown>;
    const when = parseCondition(obj.when);
    if (!when) {
      throw new ManifestParseError(`endConditions[${i}].when is required`);
    }
    return {
      when,
      reason:
        typeof obj.reason === "string" ? obj.reason : `end-${i}`,
      ...(typeof obj.goto === "string" ? { goto: obj.goto } : {}),
    };
  });

  return {
    slotsPerDay,
    slotNames,
    startDay,
    maxDay,
    stats,
    decayPerDay,
    decayStatId,
    sleepActionId,
    huntActionId,
    endConditions,
  };
}

function numberField(
  obj: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const v = obj[key];
  return typeof v === "number" ? v : fallback;
}

function arrayOfStrings(
  obj: Record<string, unknown>,
  key: string,
  fallback: string[],
): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) return fallback;
  if (v.some((x) => typeof x !== "string")) return fallback;
  return v as string[];
}
