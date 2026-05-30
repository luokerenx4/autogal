import type { SkillDef, StateDelta } from "@rpg-harness/engine";
import { extractCustom, splitFrontmatter } from "./frontmatter";
import { parseCondition } from "./condition";
import { desugarAffectionMap } from "./script";

export class SkillParseError extends Error {}

const KNOWN_KEYS = ["id", "name", "cost", "effects", "requires"] as const;

export function parseSkill(content: string, source?: string): SkillDef {
  const { meta, body } = splitFrontmatter(content);
  if (typeof meta.id !== "string" || meta.id.length === 0) {
    throw new SkillParseError(`${source ?? "skill"}: missing \`id\``);
  }
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new SkillParseError(`${source ?? meta.id}: missing \`name\``);
  }
  const def: SkillDef = {
    id: meta.id,
    name: meta.name,
    description: body.trim(),
  };
  const cost = parseEffectsObject(meta.cost, source ?? meta.id, "cost");
  if (cost) def.cost = cost;
  const effects = parseEffectsObject(meta.effects, source ?? meta.id, "effects");
  if (effects) def.effects = effects;
  const requires = parseCondition(meta.requires);
  if (requires) def.requires = requires;
  const custom = extractCustom(meta, KNOWN_KEYS);
  if (custom) def.custom = custom;
  return def;
}

function parseEffectsObject(
  raw: unknown,
  source: string,
  fieldName: string,
): StateDelta | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new SkillParseError(`${source}: ${fieldName} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const delta: StateDelta = {};
  if (obj.affection !== undefined) {
    delta.characterStats = desugarAffectionMap(
      obj.affection as Record<string, number>,
    );
  }
  if (obj.switches !== undefined) {
    delta.switches = obj.switches as Record<string, boolean>;
  }
  if (obj.variables !== undefined) {
    delta.variables = obj.variables as Record<string, number | string>;
  }
  if (obj.stats !== undefined) {
    delta.stats = obj.stats as Record<string, number>;
  }
  if (obj.statMax !== undefined) {
    delta.statMax = obj.statMax as Record<string, number>;
  }
  if (obj.inventory !== undefined) {
    delta.inventory = obj.inventory as Record<string, number>;
  }
  if (obj.weapons !== undefined) {
    delta.weapons = obj.weapons as Record<string, { power?: number }>;
  }
  return delta;
}
