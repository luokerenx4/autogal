import type { ItemDef, StateDelta } from "@rpg-harness/engine";
import { extractCustom, splitFrontmatter } from "./frontmatter";
import { desugarAffectionMap, mergeCharacterStats } from "./script";

export class ItemParseError extends Error {}

const VALID_KINDS = new Set(["consumable", "key", "gift"]);
const KNOWN_KEYS = ["id", "name", "kind", "stack", "effects"] as const;

export function parseItem(content: string, source?: string): ItemDef {
  const { meta, body } = splitFrontmatter(content);
  if (typeof meta.id !== "string" || meta.id.length === 0) {
    throw new ItemParseError(`${source ?? "item"}: missing \`id\``);
  }
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new ItemParseError(`${source ?? meta.id}: missing \`name\``);
  }
  const kind = typeof meta.kind === "string" ? meta.kind : "consumable";
  if (!VALID_KINDS.has(kind)) {
    throw new ItemParseError(
      `${source ?? meta.id}: kind must be one of ${[...VALID_KINDS].join(" / ")}, got "${kind}"`,
    );
  }
  const def: ItemDef = {
    id: meta.id,
    name: meta.name,
    description: body.trim(),
    kind: kind as ItemDef["kind"],
  };
  if (typeof meta.stack === "boolean") def.stack = meta.stack;
  const effects = parseEffectsObject(meta.effects, source ?? meta.id);
  if (effects) def.effects = effects;
  const custom = extractCustom(meta, KNOWN_KEYS);
  if (custom) def.custom = custom;
  return def;
}

function parseEffectsObject(
  raw: unknown,
  source: string,
): StateDelta | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new ItemParseError(`${source}: effects must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const delta: StateDelta = {};
  if (obj.affection !== undefined) {
    if (typeof obj.affection !== "object" || obj.affection === null) {
      throw new ItemParseError(`${source}: effects.affection must be an object`);
    }
    delta.characterStats = desugarAffectionMap(
      obj.affection as Record<string, number>,
      delta.characterStats,
    );
  }
  if (obj.characterStats !== undefined) {
    if (
      typeof obj.characterStats !== "object" ||
      obj.characterStats === null
    ) {
      throw new ItemParseError(
        `${source}: effects.characterStats must be an object`,
      );
    }
    delta.characterStats = mergeCharacterStats(
      delta.characterStats,
      obj.characterStats as Record<string, Record<string, number>>,
    );
  }
  if (obj.switches !== undefined) {
    if (typeof obj.switches !== "object" || obj.switches === null) {
      throw new ItemParseError(`${source}: effects.switches must be an object`);
    }
    delta.switches = obj.switches as Record<string, boolean>;
  }
  if (obj.variables !== undefined) {
    if (typeof obj.variables !== "object" || obj.variables === null) {
      throw new ItemParseError(
        `${source}: effects.variables must be an object`,
      );
    }
    delta.variables = obj.variables as Record<string, number | string>;
  }
  if (obj.stats !== undefined) {
    if (typeof obj.stats !== "object" || obj.stats === null) {
      throw new ItemParseError(`${source}: effects.stats must be an object`);
    }
    delta.stats = obj.stats as Record<string, number>;
  }
  if (obj.statMax !== undefined) {
    if (typeof obj.statMax !== "object" || obj.statMax === null) {
      throw new ItemParseError(`${source}: effects.statMax must be an object`);
    }
    delta.statMax = obj.statMax as Record<string, number>;
  }
  // inventory effects are C6.2's concern; ItemDef.effects shouldn't
  // reference another inventory mutation in v1 (avoids effect-loops).
  return delta;
}
