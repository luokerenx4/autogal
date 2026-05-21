import type { CharacterDef } from "@autogal/engine";
import { splitFrontmatter } from "./frontmatter";

export class CharacterParseError extends Error {}

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
  return def;
}
