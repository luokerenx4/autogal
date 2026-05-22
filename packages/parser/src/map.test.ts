import { describe, expect, test } from "bun:test";
import { MapParseError, parseMap } from "./map";

const minimalMap = `id: forest
name: 森
description: a small map
zones:
  - id: edge
    name: 入口
    connections:
      - { dir: 奥, target: deep }
  - id: deep
    name: 奥
    connections: []
`;

describe("parseMap — minimal", () => {
  test("happy path", () => {
    const m = parseMap(minimalMap);
    expect(m.id).toBe("forest");
    expect(m.name).toBe("森");
    expect(m.description).toBe("a small map");
    expect(m.difficulty).toBe(1);
    expect(m.spawnZoneId).toBe("edge");
    expect(m.zones).toHaveLength(2);
    expect(m.zones[0]?.connections).toEqual([
      { dir: "奥", target: "deep" },
    ]);
    expect(m.characterSpawns).toBeUndefined();
  });

  test("description defaults to empty", () => {
    const m = parseMap("id: m\nname: M\nzones:\n  - { id: only, name: only, connections: [] }");
    expect(m.description).toBe("");
  });

  test("difficulty defaults to 1", () => {
    const m = parseMap("id: m\nname: M\nzones:\n  - { id: only, name: only, connections: [] }");
    expect(m.difficulty).toBe(1);
  });

  test("spawn_zone_id defaults to first zone", () => {
    const m = parseMap(`id: m
name: M
zones:
  - { id: a, name: a, connections: [] }
  - { id: b, name: b, connections: [] }
`);
    expect(m.spawnZoneId).toBe("a");
  });
});

describe("parseMap — encounter / loot tables", () => {
  test("encounter_table normalizes enemy → enemyId", () => {
    const m = parseMap(`id: m
name: M
zones:
  - id: z
    name: z
    connections: []
    encounter_table:
      - { enemy: ogre, weight: 70 }
      - { enemy: null, weight: 30 }
`);
    expect(m.zones[0]?.encounterTable).toEqual([
      { enemyId: "ogre", weight: 70 },
      { enemyId: null, weight: 30 },
    ]);
  });

  test("loot_table normalizes item → itemId + carries min/max", () => {
    const m = parseMap(`id: m
name: M
zones:
  - id: z
    name: z
    connections: []
    loot_table:
      - { item: gold, min: 5, max: 12, weight: 60 }
      - { item: null, min: 0, max: 0, weight: 40 }
`);
    expect(m.zones[0]?.lootTable).toEqual([
      { itemId: "gold", min: 5, max: 12, weight: 60 },
      { itemId: null, min: 0, max: 0, weight: 40 },
    ]);
  });

  test("encounter_table not an array throws", () => {
    expect(() =>
      parseMap(`id: m
name: M
zones:
  - id: z
    name: z
    connections: []
    encounter_table: bogus
`),
    ).toThrow(/encounter_table must be an array/);
  });
});

describe("parseMap — character_spawns", () => {
  test("happy path normalizes character/encounter_script", () => {
    const m = parseMap(`id: m
name: M
zones:
  - { id: only, name: only, connections: [] }
character_spawns:
  - { character: alice, zones: [only], chance: 0.5, encounter_script: meet_alice }
`);
    expect(m.characterSpawns).toEqual([
      {
        characterId: "alice",
        zones: ["only"],
        chance: 0.5,
        encounterScriptId: "meet_alice",
      },
    ]);
  });

  test("chance outside [0,1] throws", () => {
    expect(() =>
      parseMap(`id: m
name: M
zones:
  - { id: only, name: only, connections: [] }
character_spawns:
  - { character: alice, zones: [only], chance: 5, encounter_script: meet_alice }
`),
    ).toThrow(/chance must be a number in \[0,1\]/);
  });
});

describe("parseMap — errors", () => {
  test("missing id throws", () => {
    expect(() => parseMap("name: M\nzones: []")).toThrow(MapParseError);
  });

  test("missing name throws", () => {
    expect(() => parseMap("id: m\nzones: []")).toThrow(/`name`/);
  });

  test("empty zones array throws", () => {
    expect(() => parseMap("id: m\nname: M\nzones: []")).toThrow(/non-empty/);
  });

  test("zones must be an array", () => {
    expect(() => parseMap("id: m\nname: M\nzones: 5")).toThrow(
      /`zones` must be an array/,
    );
  });

  test("spawn_zone_id pointing to non-existent zone throws", () => {
    expect(() =>
      parseMap(`id: m
name: M
spawn_zone_id: ghost
zones:
  - { id: real, name: real, connections: [] }
`),
    ).toThrow(/spawn_zone_id.*"ghost".*must reference a declared zone/);
  });

  test("invalid YAML throws", () => {
    expect(() => parseMap(":::not yaml::")).toThrow(MapParseError);
  });

  test("preserves unknown frontmatter into custom", () => {
    const m = parseMap(`id: m
name: M
zones:
  - { id: only, name: only, connections: [] }
music: theme_a
biome: forest
`);
    expect(m.custom).toEqual({ music: "theme_a", biome: "forest" });
  });
});
