import type { EnemyDef } from "@rpg-harness/engine";
import { extractCustom, splitFrontmatter } from "./frontmatter";

export class EnemyParseError extends Error {}

const KNOWN_KEYS = ["id", "name", "hp", "stats", "narrations"] as const;

export function parseEnemy(content: string, source?: string): EnemyDef {
  const { meta, body } = splitFrontmatter(content);
  if (typeof meta.id !== "string" || meta.id.length === 0) {
    throw new EnemyParseError(`${source ?? "enemy"}: missing \`id\``);
  }
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new EnemyParseError(`${source ?? meta.id}: missing \`name\``);
  }
  if (typeof meta.hp !== "number") {
    throw new EnemyParseError(`${source ?? meta.id}: \`hp\` must be a number`);
  }
  const def: EnemyDef = {
    id: meta.id,
    name: meta.name,
    description: body.trim(),
    hp: meta.hp,
  };
  if (meta.stats && typeof meta.stats === "object") {
    def.stats = meta.stats as Record<string, number>;
  }
  if (meta.narrations && typeof meta.narrations === "object") {
    const n = meta.narrations as Record<string, unknown>;
    def.narrations = {};
    if (typeof n.intro === "string") def.narrations.intro = n.intro;
    if (typeof n.victory === "string") def.narrations.victory = n.victory;
    if (typeof n.escape === "string") def.narrations.escape = n.escape;
  }
  const custom = extractCustom(meta, KNOWN_KEYS);
  if (custom) def.custom = custom;
  return def;
}
