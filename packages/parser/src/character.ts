import type { CharacterDef } from "@autogal/engine";
import { extractCustom, splitFrontmatter } from "./frontmatter";

export class CharacterParseError extends Error {}

const KNOWN_KEYS = ["id", "name", "defaultAffection"] as const;

export function parseCharacter(content: string): CharacterDef {
  const { meta } = splitFrontmatter(content);
  if (typeof meta.id !== "string" || meta.id.length === 0) {
    throw new CharacterParseError("Character missing `id`");
  }
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new CharacterParseError(`Character ${meta.id} missing \`name\``);
  }
  const def: CharacterDef = { id: meta.id, name: meta.name };
  if (typeof meta.defaultAffection === "number") {
    def.defaultAffection = meta.defaultAffection;
  }
  const custom = extractCustom(meta, KNOWN_KEYS);
  if (custom) def.custom = custom;
  return def;
}
