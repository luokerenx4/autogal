import type { WeaponDef } from "@autogal/engine";
import { splitFrontmatter } from "./frontmatter";

export class WeaponParseError extends Error {}

export function parseWeapon(content: string, source?: string): WeaponDef {
  const { meta, body } = splitFrontmatter(content);
  if (typeof meta.id !== "string" || meta.id.length === 0) {
    throw new WeaponParseError(`${source ?? "weapon"}: missing \`id\``);
  }
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new WeaponParseError(`${source ?? meta.id}: missing \`name\``);
  }
  if (typeof meta.basePower !== "number") {
    throw new WeaponParseError(
      `${source ?? meta.id}: \`basePower\` must be a number`,
    );
  }
  const def: WeaponDef = {
    id: meta.id,
    name: meta.name,
    description: body.trim(),
    basePower: meta.basePower,
  };
  if (typeof meta.kind === "string") def.kind = meta.kind;
  if (meta.properties && typeof meta.properties === "object") {
    def.properties = meta.properties as Record<string, number>;
  }
  return def;
}
