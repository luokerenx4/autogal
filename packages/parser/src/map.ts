import { parse as parseYaml } from "yaml";
import type {
  CharacterSpawnRule,
  MapDef,
  MapZoneDef,
} from "@autogal/engine";

export class MapParseError extends Error {}

const KNOWN_KEYS = [
  "id",
  "name",
  "description",
  "difficulty",
  "spawn_zone_id",
  "zones",
  "character_spawns",
] as const;

// Parse a `maps/<id>.yaml` file into an engine-level MapDef. Maps stay
// pure YAML (not markdown + frontmatter): they're large structured
// documents and pretending the body is "description" would be silly.
// The top-level `description:` field carries that instead. snake_case
// in the YAML (matching the existing sengoku-raid convention) is
// normalized to camelCase on the engine side.
export function parseMap(content: string, source?: string): MapDef {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new MapParseError(
      `${source ?? "map"}: invalid YAML — ${(err as Error).message}`,
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MapParseError(`${source ?? "map"}: must be a YAML object`);
  }
  const obj = raw as Record<string, unknown>;

  const id = readString(obj, "id", source);
  const name = readString(obj, "name", source ?? id);
  const description =
    typeof obj.description === "string" ? obj.description : "";
  const difficulty =
    typeof obj.difficulty === "number" ? obj.difficulty : 1;

  const zonesRaw = obj.zones;
  if (!Array.isArray(zonesRaw)) {
    throw new MapParseError(`${source ?? id}: \`zones\` must be an array`);
  }
  const zones: MapZoneDef[] = zonesRaw.map((z, i) =>
    parseZone(z, source ?? id, i),
  );
  if (zones.length === 0) {
    throw new MapParseError(`${source ?? id}: \`zones\` must be non-empty`);
  }

  // spawn_zone_id is optional — defaults to the first declared zone.
  // When present, must reference a zone id in this map.
  const spawnZoneIdRaw =
    typeof obj.spawn_zone_id === "string" ? obj.spawn_zone_id : zones[0]!.id;
  if (!zones.some((z) => z.id === spawnZoneIdRaw)) {
    throw new MapParseError(
      `${source ?? id}: \`spawn_zone_id\` "${spawnZoneIdRaw}" must reference a declared zone`,
    );
  }

  const spawnsRaw = obj.character_spawns;
  let characterSpawns: CharacterSpawnRule[] | undefined;
  if (spawnsRaw !== undefined) {
    if (!Array.isArray(spawnsRaw)) {
      throw new MapParseError(
        `${source ?? id}: \`character_spawns\` must be an array`,
      );
    }
    characterSpawns = spawnsRaw.map((s, i) =>
      parseSpawn(s, source ?? id, i),
    );
  }

  const def: MapDef = {
    id,
    name,
    description,
    difficulty,
    spawnZoneId: spawnZoneIdRaw,
    zones,
  };
  if (characterSpawns && characterSpawns.length > 0) {
    def.characterSpawns = characterSpawns;
  }
  const custom = extractCustom(obj, KNOWN_KEYS);
  if (custom) def.custom = custom;
  return def;
}

function parseZone(
  raw: unknown,
  source: string,
  idx: number,
): MapZoneDef {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MapParseError(`${source}: zones[${idx}] must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const id = readString(obj, "id", `${source}.zones[${idx}]`);
  const name =
    typeof obj.name === "string" && obj.name.length > 0 ? obj.name : id;

  const connections = parseConnections(
    obj.connections,
    `${source}.zones[${id}]`,
  );

  const zone: MapZoneDef = { id, name, connections };
  if (obj.is_extract === true) zone.isExtract = true;

  if (obj.encounter_table !== undefined) {
    if (!Array.isArray(obj.encounter_table)) {
      throw new MapParseError(
        `${source}.zones[${id}].encounter_table must be an array`,
      );
    }
    zone.encounterTable = obj.encounter_table.map((e, ei) => {
      if (!e || typeof e !== "object") {
        throw new MapParseError(
          `${source}.zones[${id}].encounter_table[${ei}] must be an object`,
        );
      }
      const eo = e as Record<string, unknown>;
      const enemyId =
        typeof eo.enemy === "string"
          ? eo.enemy
          : eo.enemy === null
            ? null
            : null;
      const weight = typeof eo.weight === "number" ? eo.weight : 1;
      return { enemyId, weight };
    });
  }

  if (obj.loot_table !== undefined) {
    if (!Array.isArray(obj.loot_table)) {
      throw new MapParseError(
        `${source}.zones[${id}].loot_table must be an array`,
      );
    }
    zone.lootTable = obj.loot_table.map((l, li) => {
      if (!l || typeof l !== "object") {
        throw new MapParseError(
          `${source}.zones[${id}].loot_table[${li}] must be an object`,
        );
      }
      const lo = l as Record<string, unknown>;
      const itemId =
        typeof lo.item === "string"
          ? lo.item
          : lo.item === null
            ? null
            : null;
      return {
        itemId,
        min: typeof lo.min === "number" ? lo.min : 0,
        max: typeof lo.max === "number" ? lo.max : 0,
        weight: typeof lo.weight === "number" ? lo.weight : 1,
      };
    });
  }

  return zone;
}

function parseConnections(
  raw: unknown,
  source: string,
): { dir: string; target: string }[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new MapParseError(`${source}.connections must be an array`);
  }
  return raw.map((c, i) => {
    if (!c || typeof c !== "object") {
      throw new MapParseError(`${source}.connections[${i}] must be an object`);
    }
    const co = c as Record<string, unknown>;
    if (typeof co.dir !== "string") {
      throw new MapParseError(
        `${source}.connections[${i}].dir must be a string`,
      );
    }
    if (typeof co.target !== "string") {
      throw new MapParseError(
        `${source}.connections[${i}].target must be a string`,
      );
    }
    return { dir: co.dir, target: co.target };
  });
}

function parseSpawn(
  raw: unknown,
  source: string,
  idx: number,
): CharacterSpawnRule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MapParseError(
      `${source}: character_spawns[${idx}] must be an object`,
    );
  }
  const obj = raw as Record<string, unknown>;
  const characterId = readString(
    obj,
    "character",
    `${source}.character_spawns[${idx}]`,
  );
  if (!Array.isArray(obj.zones) || obj.zones.some((z) => typeof z !== "string")) {
    throw new MapParseError(
      `${source}.character_spawns[${idx}].zones must be an array of strings`,
    );
  }
  if (typeof obj.chance !== "number" || obj.chance < 0 || obj.chance > 1) {
    throw new MapParseError(
      `${source}.character_spawns[${idx}].chance must be a number in [0,1]`,
    );
  }
  const encounterScriptId = readString(
    obj,
    "encounter_script",
    `${source}.character_spawns[${idx}]`,
  );
  return {
    characterId,
    zones: obj.zones as string[],
    chance: obj.chance,
    encounterScriptId,
  };
}

function readString(
  obj: Record<string, unknown>,
  key: string,
  source?: string,
): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new MapParseError(
      `${source ?? "map"}: \`${key}\` must be a non-empty string`,
    );
  }
  return v;
}

function extractCustom(
  meta: Record<string, unknown>,
  knownKeys: readonly string[],
): Record<string, unknown> | undefined {
  const skip = new Set(knownKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!skip.has(k)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
