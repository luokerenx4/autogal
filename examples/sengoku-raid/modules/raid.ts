// sengoku-raid: the headless extraction-shooter module.
//
// Owns:
//   - mode flag (HUB / RAID)
//   - per-raid sub-state (current zone, encounter, pending loot)
//   - persistent player flags (HP/mental/spectral/intellect via baseline.flags)
//   - the hub menu (mode-dependent activities) via onHubBuild
//   - all raid + hub actions via the raid:/hub: prefix, dispatched from
//     the preset (NOT through engine actionMap — that's for static
//     actions/*.yaml only)
//   - reactive triggers: death, spectral overload
//
// Why not training preset?
//   We want HP/spectral as free-form clampable numbers and we want our
//   onHubBuild to win first-wins. Skipping game.training avoids both.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkTriggers, evaluateCondition } from "@autogal/engine";

// Bun ships with a built-in YAML parser; we use it here so games don't
// need to declare a `yaml` dependency to load map data files. If we
// later want to run under Node, swap to the `yaml` package (already in
// the workspace's devDependencies).
declare const Bun: { YAML: { parse: (s: string) => unknown } };
const parseYaml = (s: string) => Bun.YAML.parse(s);
import type {
  Game,
  HubActivity,
  Input,
  Module,
  Output,
  PresetContext,
  Trigger,
} from "@autogal/engine";

const MODULE_ID = "sengoku-raid";

// Resolve our own directory so we can find maps/ alongside us.
// Engine doesn't tell modules where the game root is, so we infer.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(MODULE_DIR, "..", "maps");

// ============================================================================
// Persistent player stats (baseline.flags). Engine's flag delta is
// additive for numbers, so { flags: { hp: -5 } } subtracts.
// ============================================================================

const STAT_DEFAULTS = {
  hp: 30,
  hpMax: 30,
  mental: 10,
  mentalMax: 10,
  spectral: 5,
  intellect: 0,
  raidsCompleted: 0,
  raidsFailed: 0,
};

type Stat = keyof typeof STAT_DEFAULTS;

function getFlag(ctx: PresetContext, name: Stat): number {
  const v = ctx.state.baseline.flags[name];
  return typeof v === "number" ? v : STAT_DEFAULTS[name];
}

function setFlag(ctx: PresetContext, name: Stat, value: number): void {
  ctx.state.baseline.flags[name] = value;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ============================================================================
// Module sub-state
// ============================================================================

interface ZoneInstance {
  id: string;
  name: string;
  visited: boolean;
  searched: boolean;
  encounter: null | {
    enemyId: string;
    enemyHp: number;
    enemyHpMax: number;
  };
  encounterCleared: boolean; // was there an encounter that's been resolved
  encounterTable: { enemyId: string | null; weight: number }[];
  lootTable: { itemId: string | null; min: number; max: number; weight: number }[];
  connections: { dir: string; target: string }[];
  isExtract: boolean;
  pendingLoot: Record<string, number>;
}

interface RaidInstance {
  mapId: string;
  mapName: string;
  currentZoneId: string;
  zones: Record<string, ZoneInstance>;
  pendingLoot: Record<string, number>; // gathered this raid
  turnsTaken: number;
}

interface RaidModuleState {
  mode: "hub" | "raid";
  raid: RaidInstance | null;
  metCharacters: string[];
}

function moduleState(ctx: PresetContext): RaidModuleState {
  const s = ctx.state[MODULE_ID] as RaidModuleState | undefined;
  if (!s) throw new Error(`${MODULE_ID}: module state missing`);
  return s;
}

// ============================================================================
// Map definitions — module-private data (not registered with engine)
// ============================================================================

interface MapDef {
  id: string;
  name: string;
  difficulty: number;
  description: string;
  spawnZoneId: string;
  zones: MapZoneDef[];
  characterSpawns?: CharacterSpawnRule[];
}

interface MapZoneDef {
  id: string;
  name: string;
  connections: { dir: string; target: string }[];
  isExtract?: boolean;
  encounterTable?: { enemyId: string | null; weight: number }[];
  lootTable?: { itemId: string | null; min: number; max: number; weight: number }[];
}

interface CharacterSpawnRule {
  characterId: string;
  zones: string[];
  chance: number;          // 0..1
  encounterScriptId: string;
  // Module evaluates: never re-spawn after first meeting (we check
  // metCharacters). Additional gates could go here later (day count,
  // weapon power, etc.) but vertical slice keeps it simple.
}

// MAPS are loaded eagerly at module evaluation time from maps/*.yaml.
// We use synchronous fs reads here so the table is populated by the
// time Module.initialize() runs — engine doesn't have a "load maps"
// asset category, so this is the module's own asset registry.
// Adding a new map = drop a YAML file in maps/, no code changes.
const MAPS: Record<string, MapDef> = loadMapsFromDisk();

function loadMapsFromDisk(): Record<string, MapDef> {
  const out: Record<string, MapDef> = {};
  let files: string[];
  try {
    files = readdirSync(MAPS_DIR).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const f of files.sort()) {
    const raw = readFileSync(join(MAPS_DIR, f), "utf-8");
    const parsed = parseYaml(raw) as Record<string, unknown>;
    const map = normalizeMapDef(parsed, f);
    out[map.id] = map;
  }
  return out;
}

function normalizeMapDef(raw: Record<string, unknown>, src: string): MapDef {
  const id = String(raw.id ?? "");
  if (!id) throw new Error(`${src}: missing id`);
  const zonesRaw = raw.zones;
  if (!Array.isArray(zonesRaw)) {
    throw new Error(`${src}: zones must be an array`);
  }
  const zones: MapZoneDef[] = zonesRaw.map((z, i) => {
    const zo = z as Record<string, unknown>;
    return {
      id: String(zo.id ?? ""),
      name: String(zo.name ?? zo.id ?? `zone_${i}`),
      connections: (zo.connections as Array<{ dir: string; target: string }>) ?? [],
      isExtract: !!zo.is_extract,
      encounterTable: ((zo.encounter_table as Array<Record<string, unknown>>) ?? []).map(
        (e) => ({
          enemyId: (e.enemy as string | null) ?? null,
          weight: Number(e.weight ?? 1),
        }),
      ),
      lootTable: ((zo.loot_table as Array<Record<string, unknown>>) ?? []).map(
        (l) => ({
          itemId: (l.item as string | null) ?? null,
          min: Number(l.min ?? 0),
          max: Number(l.max ?? 0),
          weight: Number(l.weight ?? 1),
        }),
      ),
    };
  });
  const spawnsRaw = (raw.character_spawns as Array<Record<string, unknown>>) ?? [];
  const characterSpawns: CharacterSpawnRule[] = spawnsRaw.map((s) => ({
    characterId: String(s.character ?? ""),
    zones: (s.zones as string[]) ?? [],
    chance: Number(s.chance ?? 0.5),
    encounterScriptId: String(s.encounter_script ?? ""),
  }));
  return {
    id,
    name: String(raw.name ?? id),
    difficulty: Number(raw.difficulty ?? 1),
    description: String(raw.description ?? ""),
    spawnZoneId: String(raw.spawn_zone_id ?? zones[0]?.id ?? ""),
    zones,
    characterSpawns,
  };
}

function discoverableMaps(_ctx: PresetContext): string[] {
  // For now all maps are always discoverable. Future: gate harder maps
  // behind raidsCompleted thresholds or quest flags.
  return Object.keys(MAPS).sort((a, b) => {
    const da = MAPS[a]?.difficulty ?? 0;
    const db = MAPS[b]?.difficulty ?? 0;
    return da - db;
  });
}

// ============================================================================
// Random helpers (use ctx.rng for determinism)
// ============================================================================

function pickWeighted<T extends { weight: number }>(
  rng: () => number,
  pool: T[],
): T {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1]!;
}

function rollIntInclusive(rng: () => number, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ============================================================================
// Hub menu construction (mode-dependent)
// ============================================================================

function buildSnapshot(activities: HubActivity[], ctx: PresetContext): Output {
  return {
    type: "hubMenu",
    snapshot: {
      day: 0,
      maxDay: 0,
      slot: 0,
      slotName: "",
      slotsPerDay: 0,
      stats: buildStatSnapshots(ctx),
      affections: buildAffectionSnapshots(ctx),
      activities,
    },
  };
}

function buildStatSnapshots(ctx: PresetContext) {
  const ryo = ctx.state.baseline.inventory.ryo ?? 0;
  return [
    {
      id: "hp",
      name: "体力",
      value: getFlag(ctx, "hp"),
      min: 0,
      max: getFlag(ctx, "hpMax"),
      thresholds: [
        { min: 0, label: "瀕死", color: "red" as const },
        { min: 6, label: "負傷", color: "yellow" as const },
        { min: 15, label: "万全", color: "green" as const },
      ],
    },
    {
      id: "mental",
      name: "精神",
      value: getFlag(ctx, "mental"),
      min: 0,
      max: getFlag(ctx, "mentalMax"),
      thresholds: [
        { min: 0, label: "崩壊", color: "red" as const },
        { min: 3, label: "安定", color: "green" as const },
      ],
    },
    {
      id: "spectral",
      name: "霊体化",
      value: getFlag(ctx, "spectral"),
      min: 0,
      max: 100,
      thresholds: [
        { min: 0, label: "平穏", color: "green" as const },
        { min: 20, label: "覚醒", color: "cyan" as const },
        { min: 50, label: "危険", color: "yellow" as const },
        { min: 80, label: "暴走寸前", color: "red" as const },
      ],
    },
    { id: "intellect", name: "学識", value: getFlag(ctx, "intellect"), min: 0, max: 99 },
    { id: "ryo", name: "両", value: ryo, min: 0, max: 99999 },
  ];
}

function buildAffectionSnapshots(ctx: PresetContext) {
  const m = moduleState(ctx);
  return ctx.game.characters
    .filter((c) => m.metCharacters.includes(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: ctx.state.baseline.characters[c.id]?.affection ?? 0,
    }));
}

function buildHubMenu(ctx: PresetContext): Output {
  const m = moduleState(ctx);
  const activities: HubActivity[] = [];

  // Per-character bonding: hub-side gift + scripted bond scenes.
  // The bond scripts are static files (scripts/bond_<id>_NN.md) with
  // affection-gated `requires:` clauses. They're surfaced here as
  // "script:" activities, dispatched through the engine's standard
  // dispatch (NOT the raid module's prefix), so script completion
  // hooks fire normally and the script gets logged to completedScripts.
  for (const charId of m.metCharacters) {
    const char = ctx.game.characters.find((c) => c.id === charId);
    if (!char) continue;
    const ryo = ctx.state.baseline.inventory.ryo ?? 0;
    activities.push({
      id: `hub:bond:${charId}`,
      kind: "action",
      title: `${char.name}に贈り物をする`,
      description: "好感度 +1（50 両）",
      category: "social",
      cost: 0,
      effectsHint: `${char.name}+1 ryo-50`,
      available: ryo >= 50,
      lockedReason: ryo < 50 ? "両が足りない" : undefined,
    });
    // Surface eligible bond scripts. Engine evaluates the script's
    // `requires:` block when it builds them in the hub menu; we just
    // forward the unfilled ones for this character.
    for (const script of ctx.game.scripts) {
      if (!script.id.startsWith(`bond_${charId}_`)) continue;
      if (ctx.state.baseline.completedScripts.includes(script.id)) continue;
      // Check the script's requires manually since we're not going
      // through the engine's hub builder (which would do this for us).
      const reqs = script.requires;
      const eligible = reqs === undefined || evaluateCondition(reqs, ctx.state);
      if (!eligible) continue;
      activities.push({
        id: `script:${script.id}`,
        kind: "script",
        title: `${char.name} — ${script.title}`,
        category: "social",
        cost: 0,
        available: true,
      });
    }
  }

  // Sell loot
  const lootIds = Object.entries(ctx.state.baseline.inventory).filter(
    ([id, n]) => n > 0 && isLoot(ctx, id),
  );
  if (lootIds.length > 0) {
    const total = lootIds.reduce((sum, [id, n]) => sum + n * sellValue(ctx, id), 0);
    activities.push({
      id: "hub:sell_all_loot",
      kind: "action",
      title: `戦利品を炼器師に売る（${total} 両）`,
      description: lootIds.map(([id, n]) => `${itemName(ctx, id)} ×${n}`).join("、"),
      category: "shop",
      cost: 0,
      available: true,
    });
  }

  // Upgrade weapon
  const shards = ctx.state.baseline.inventory.soul_shard ?? 0;
  const ryo = ctx.state.baseline.inventory.ryo ?? 0;
  const canUpgrade = shards >= 3 && ryo >= 100;
  activities.push({
    id: "hub:upgrade_weapon",
    kind: "action",
    title: "炼器師に妖刀を鍛え直させる（威力 +2）",
    description: "魂石碎片 ×3 + 100 両",
    category: "shop",
    cost: 0,
    available: canUpgrade,
    lockedReason: canUpgrade
      ? undefined
      : `魂石碎片 ≥3（現在 ${shards}）、両 ≥100（現在 ${ryo}）`,
  });

  // Rest (recover HP/mental)
  const hp = getFlag(ctx, "hp");
  const hpMax = getFlag(ctx, "hpMax");
  if (hp < hpMax) {
    activities.push({
      id: "hub:rest",
      kind: "action",
      title: "宿で休む（体力・精神を全回復）",
      description: "霊体化は変わらない",
      category: "rest",
      cost: 0,
      available: true,
    });
  }

  // Use chinkonho (skill granted by篝 bond) — drops spectral by 20.
  // Only available in hub (combat is too tense per篝's teaching), and
  // only when player actually has the skill.
  if (ctx.state.baseline.knownSkills.includes("chinkonho")) {
    const spec = getFlag(ctx, "spectral");
    activities.push({
      id: "hub:use_chinkonho",
      kind: "action",
      title: "鎮魂法を行う（霊体化 -20）",
      description: "篝伝授の口伝。集中して長く息を吐く",
      category: "spirit",
      cost: 0,
      available: spec >= 10,
      lockedReason: spec >= 10 ? undefined : "霊体化が低すぎて鎮める意味がない",
    });
  }

  // Depart on raid
  for (const mapId of discoverableMaps(ctx)) {
    const map = MAPS[mapId];
    if (!map) continue;
    const hpFull = hp >= hpMax;
    activities.push({
      id: `hub:depart:${mapId}`,
      kind: "action",
      title: `出立 — ${map.name}（難度 ${map.difficulty}）`,
      description: map.description,
      category: "raid",
      cost: 0,
      available: hpFull,
      lockedReason: hpFull ? undefined : "体力が満たぬ。先に休め。",
    });
  }

  return buildSnapshot(activities, ctx);
}

function buildRaidMenu(ctx: PresetContext): Output {
  const m = moduleState(ctx);
  if (!m.raid) return buildHubMenu(ctx);

  const zone = m.raid.zones[m.raid.currentZoneId];
  if (!zone) throw new Error(`${MODULE_ID}: invalid zone ${m.raid.currentZoneId}`);

  const activities: HubActivity[] = [];

  if (zone.encounter) {
    activities.push({
      id: "raid:attack",
      kind: "action",
      title: `斬る — ${enemyName(ctx, zone.encounter.enemyId)}（HP ${zone.encounter.enemyHp}/${zone.encounter.enemyHpMax}）`,
      description: "妖刀威力 × (1 + 霊体化×0.04) × ばらつき",
      category: "combat",
      cost: 0,
      available: true,
    });
    activities.push({
      id: "raid:sneak_strike",
      kind: "action",
      title: "不意打ちを狙う",
      description: "学識+霊体化判定。成功で大ダメージ、失敗で外す",
      category: "combat",
      cost: 0,
      available: true,
    });
    activities.push({
      id: "raid:flee",
      kind: "action",
      title: "逃げる",
      description: "霊体化判定。失敗で一発被弾",
      category: "combat",
      cost: 0,
      available: true,
    });
  } else {
    if (!zone.searched && Object.keys(zone.pendingLoot).length > 0) {
      activities.push({
        id: "raid:search",
        kind: "action",
        title: "この区域を探る",
        category: "raid",
        cost: 0,
        available: true,
      });
    }
    if (zone.isExtract) {
      activities.push({
        id: "raid:extract",
        kind: "action",
        title: `${zone.name} から撤退して大名府に戻る`,
        description: "戦利品を蔵に納める",
        category: "raid",
        cost: 0,
        available: true,
      });
    }
    for (const conn of zone.connections) {
      const target = m.raid.zones[conn.target];
      const visitedNote = target?.visited ? "（既訪）" : "";
      activities.push({
        id: `raid:move:${conn.target}`,
        kind: "action",
        title: `${conn.dir}へ進む — ${target?.name ?? conn.target}${visitedNote}`,
        category: "raid",
        cost: 0,
        available: true,
      });
    }
  }

  return buildSnapshot(activities, ctx);
}

// ============================================================================
// Helpers
// ============================================================================

// NOTE: engine's parseItem only preserves a fixed schema (id/name/
// description/kind/stack/effects) — unknown frontmatter fields like
// `sell_value` are dropped at parse time. Until the engine grows a
// `custom: Record<string,unknown>` passthrough on ItemDef, this table
// is the module's private item metadata. Adding a new sellable item
// requires touching this table AND items/<id>.md, which is the kind of
// double-bookkeeping that "headless RPGMaker" should ideally avoid.
const SELL_VALUES: Record<string, number> = {
  soul_shard: 30,
  oni_horn: 80,
  cursed_blade_fragment: 300,
};

function isLoot(_ctx: PresetContext, itemId: string): boolean {
  return itemId in SELL_VALUES;
}

function sellValue(_ctx: PresetContext, itemId: string): number {
  return SELL_VALUES[itemId] ?? 0;
}

function itemName(ctx: PresetContext, itemId: string): string {
  return ctx.game.items?.find((i) => i.id === itemId)?.name ?? itemId;
}

function enemyName(ctx: PresetContext, enemyId: string): string {
  return ctx.game.enemies?.find((e) => e.id === enemyId)?.name ?? enemyId;
}

function enemyAttackPower(ctx: PresetContext, enemyId: string): number {
  const e = ctx.game.enemies?.find((x) => x.id === enemyId);
  if (!e) return 1;
  const raw = (e as unknown as { attack_power?: unknown }).attack_power;
  return typeof raw === "number" ? raw : 1;
}

function enemyHp(ctx: PresetContext, enemyId: string): number {
  return ctx.game.enemies?.find((e) => e.id === enemyId)?.hp ?? 1;
}

function getEnemyNarration(
  ctx: PresetContext,
  enemyId: string,
  key: "intro" | "victory" | "escape",
): string | undefined {
  const e = ctx.game.enemies?.find((x) => x.id === enemyId);
  return e?.narrations?.[key];
}

function fillTemplate(tmpl: string, vars: Record<string, string | number>): string {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

function getSwordPower(ctx: PresetContext): number {
  const id = ctx.state.baseline.equippedWeaponId;
  if (!id) return 1;
  return ctx.state.baseline.weapons[id]?.power ?? 1;
}

// ============================================================================
// Raid lifecycle
// ============================================================================

function startRaid(ctx: PresetContext, mapId: string): void {
  const map = MAPS[mapId];
  if (!map) throw new Error(`${MODULE_ID}: unknown map ${mapId}`);
  const m = moduleState(ctx);

  const zones: Record<string, ZoneInstance> = {};
  for (const z of map.zones) {
    zones[z.id] = {
      id: z.id,
      name: z.name,
      visited: false,
      searched: false,
      encounter: null,
      encounterCleared: false,
      encounterTable: z.encounterTable ?? [{ enemyId: null, weight: 1 }],
      lootTable: z.lootTable ?? [],
      connections: z.connections,
      isExtract: !!z.isExtract,
      pendingLoot: {},
    };
  }

  m.raid = {
    mapId,
    mapName: map.name,
    currentZoneId: map.spawnZoneId,
    zones,
    pendingLoot: {},
    turnsTaken: 0,
  };
  m.mode = "raid";

  // Visit the spawn zone (roll its loot but no encounter at spawn).
  const spawn = zones[map.spawnZoneId]!;
  spawn.visited = true;
  spawn.pendingLoot = rollLoot(ctx, spawn);
  // Spawn has trivial encounter table (only `null`) — encounter stays null.

  ctx.state.runtime.pendingNarrations.push(
    `${map.name}に踏み入る。霧が脛に絡みつく。`,
  );
}

function rollEncounter(
  ctx: PresetContext,
  zone: ZoneInstance,
): null | { enemyId: string; enemyHp: number; enemyHpMax: number } {
  if (zone.encounterTable.length === 0) return null;
  const pick = pickWeighted(ctx.rng, zone.encounterTable);
  if (pick.enemyId === null) return null;
  const hp = enemyHp(ctx, pick.enemyId);
  return { enemyId: pick.enemyId, enemyHp: hp, enemyHpMax: hp };
}

function rollCharacterSpawn(
  ctx: PresetContext,
  mapId: string,
  zoneId: string,
): CharacterSpawnRule | null {
  const map = MAPS[mapId];
  if (!map?.characterSpawns) return null;
  const m = moduleState(ctx);
  for (const rule of map.characterSpawns) {
    if (m.metCharacters.includes(rule.characterId)) continue;
    if (!rule.zones.includes(zoneId)) continue;
    if (ctx.rng() <= rule.chance) return rule;
  }
  return null;
}

function rollLoot(ctx: PresetContext, zone: ZoneInstance): Record<string, number> {
  if (zone.lootTable.length === 0) return {};
  const pick = pickWeighted(ctx.rng, zone.lootTable);
  if (pick.itemId === null) return {};
  const count = rollIntInclusive(ctx.rng, pick.min, pick.max);
  return { [pick.itemId]: count };
}

function endRaidExtract(ctx: PresetContext): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  // Transfer pendingLoot to baseline.inventory.
  const lootSummary: string[] = [];
  for (const [itemId, count] of Object.entries(m.raid.pendingLoot)) {
    if (count <= 0) continue;
    ctx.state.baseline.inventory[itemId] =
      (ctx.state.baseline.inventory[itemId] ?? 0) + count;
    lootSummary.push(`${itemName(ctx, itemId)} ×${count}`);
  }
  const mapName = m.raid.mapName;
  m.raid = null;
  m.mode = "hub";
  setFlag(ctx, "raidsCompleted", getFlag(ctx, "raidsCompleted") + 1);

  ctx.state.runtime.pendingNarrations.push(
    `${mapName}から撤退に成功。${lootSummary.length > 0 ? "持ち帰った戦利品：" + lootSummary.join("、") + "。" : "今回は手ぶら。"}`,
  );
}

function endRaidFailure(ctx: PresetContext, reason: string): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  const mapName = m.raid.mapName;
  m.raid = null;
  m.mode = "hub";
  setFlag(ctx, "raidsFailed", getFlag(ctx, "raidsFailed") + 1);
  // Reset HP/mental/spectral to defaults (death/overload triggered).
  // hp = 1 so player has to rest; mental partial; spectral cut.
  setFlag(ctx, "hp", 1);
  setFlag(ctx, "mental", Math.max(1, Math.floor(getFlag(ctx, "mentalMax") / 2)));
  setFlag(ctx, "spectral", Math.max(5, Math.floor(getFlag(ctx, "spectral") / 2)));
  ctx.state.runtime.pendingNarrations.push(
    `${mapName}での討伐は失敗——${reason}。戦利品は全て失われた。気がついたら大名府の御殿医の枕元。`,
  );
}

// ============================================================================
// Combat
// ============================================================================

function doAttackRound(ctx: PresetContext, kind: "normal" | "sneak"): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  const zone = m.raid.zones[m.raid.currentZoneId]!;
  if (!zone.encounter) return;

  const sword = getSwordPower(ctx);
  const spec = getFlag(ctx, "spectral");
  const intellect = getFlag(ctx, "intellect");

  // Player strikes first.
  let damage: number;
  let hitLine: string;
  if (kind === "sneak") {
    // Skill check: rng() * 100 < intellect*5 + spectral*0.5
    const dc = intellect * 5 + spec * 0.5;
    const roll = ctx.rng() * 100;
    if (roll < dc) {
      damage = Math.floor(sword * (1 + spec * 0.04) * 2.2 * (0.9 + ctx.rng() * 0.2));
      hitLine = `不意打ちが入った。柄を掴み直す間もなく一刀で割く——${damage} のダメージ。`;
    } else {
      damage = 0;
      hitLine = `間合いを誤った——一閃外す。`;
    }
  } else {
    const variance = 0.8 + ctx.rng() * 0.4;
    const critRoll = ctx.rng() * 100;
    const isCrit = critRoll < spec * 0.7;
    damage = Math.floor(sword * (1 + spec * 0.04) * variance * (isCrit ? 2 : 1));
    hitLine = isCrit
      ? `妖刀が震えた。倍の威力で斬り抜く——${damage} のダメージ。`
      : `刀を振るう。${damage} のダメージ。`;
  }

  ctx.state.runtime.pendingNarrations.push(hitLine);
  zone.encounter.enemyHp -= damage;

  // Spectral creep from striking
  setFlag(ctx, "spectral", Math.min(100, spec + 1));

  if (zone.encounter.enemyHp <= 0) {
    // Victory
    const enemyId = zone.encounter.enemyId;
    const hpMax = zone.encounter.enemyHpMax;
    const absorb = Math.floor(hpMax / 2);
    const swordGain = Math.max(1, Math.floor(hpMax / 4));
    const tmpl = getEnemyNarration(ctx, enemyId, "victory");
    if (tmpl) {
      ctx.state.runtime.pendingNarrations.push(
        fillTemplate(tmpl, {
          name: enemyName(ctx, enemyId),
          hp: hpMax,
          absorb,
          swordGain,
          damage,
        }),
      );
    }
    setFlag(ctx, "spectral", Math.max(0, getFlag(ctx, "spectral") - absorb));
    const wid = ctx.state.baseline.equippedWeaponId;
    if (wid) {
      const w = ctx.state.baseline.weapons[wid];
      if (w) w.power = w.power + swordGain;
    }
    zone.encounter = null;
    zone.encounterCleared = true;
    return;
  }

  // Enemy counter-attacks
  const enemyPow = enemyAttackPower(ctx, zone.encounter.enemyId);
  const enemyHit = Math.max(
    1,
    Math.floor(enemyPow * (0.8 + ctx.rng() * 0.4)),
  );
  const fumbleRoll = ctx.rng() * 100;
  const isFumble = fumbleRoll < spec * 0.5;
  // High spectral makes the player less coordinated defending.

  const finalEnemyDamage = isFumble ? Math.floor(enemyHit * 1.6) : enemyHit;
  setFlag(ctx, "hp", getFlag(ctx, "hp") - finalEnemyDamage);
  ctx.state.runtime.pendingNarrations.push(
    isFumble
      ? `${enemyName(ctx, zone.encounter.enemyId)}の反撃。霊体化が暴れて体が思うように動かず——${finalEnemyDamage} のダメージ。`
      : `${enemyName(ctx, zone.encounter.enemyId)}の反撃。${finalEnemyDamage} のダメージ。`,
  );
  setFlag(ctx, "mental", Math.max(0, getFlag(ctx, "mental") - 1));
}

function doFlee(ctx: PresetContext): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  const zone = m.raid.zones[m.raid.currentZoneId]!;
  if (!zone.encounter) return;
  const enemyId = zone.encounter.enemyId;

  // Hayagake (taught by 霞): flee always succeeds, no damage, no mental
  // cost. The "猟師の足" is the technical reason; narratively this is the
  // one favor she asked for in return.
  if (ctx.state.baseline.knownSkills.includes("hayagake")) {
    ctx.state.runtime.pendingNarrations.push(
      `霞に教わった足運び——${enemyName(ctx, enemyId)}が振り向く半秒前に、お主はもう間合いの外。`,
    );
    zone.encounter = null;
    zone.encounterCleared = true;
    return;
  }

  const spec = getFlag(ctx, "spectral");
  const dc = 30 + spec; // higher spec = harder (you're slow)
  const roll = ctx.rng() * 100;
  if (roll > dc - 10) {
    ctx.state.runtime.pendingNarrations.push(
      `${enemyName(ctx, enemyId)}の隙を縫って退いた。`,
    );
    zone.encounter = null;
    zone.encounterCleared = true;
    setFlag(ctx, "mental", Math.max(0, getFlag(ctx, "mental") - 1));
  } else {
    const dmg = Math.max(2, enemyAttackPower(ctx, enemyId) + 1);
    setFlag(ctx, "hp", getFlag(ctx, "hp") - dmg);
    ctx.state.runtime.pendingNarrations.push(
      `背を見せた瞬間、${enemyName(ctx, enemyId)}に追いつかれた——${dmg} のダメージ。`,
    );
  }
}

// ============================================================================
// Activity dispatcher (called by preset/run.ts for raid:/hub: prefixes)
// ============================================================================

export async function* dispatchRaidActivity(
  ctx: PresetContext,
  activityId: string,
): AsyncGenerator<Output, "ok" | "quit", Input> {
  const result = yield* doDispatchRaidActivity(ctx, activityId);
  // Module mutates baseline.flags directly via setFlag (bypassing
  // mutateState), so triggers wouldn't otherwise fire. Force a check
  // after every handler completes.
  checkTriggers(ctx);
  return result;
}

async function* doDispatchRaidActivity(
  ctx: PresetContext,
  activityId: string,
): AsyncGenerator<Output, "ok" | "quit", Input> {
  const m = moduleState(ctx);

  // ────────── HUB-side ──────────
  if (activityId.startsWith("hub:depart:")) {
    const mapId = activityId.slice("hub:depart:".length);
    startRaid(ctx, mapId);
    return "ok";
  }
  if (activityId.startsWith("hub:bond:")) {
    const charId = activityId.slice("hub:bond:".length);
    const ryo = ctx.state.baseline.inventory.ryo ?? 0;
    if (ryo < 50) return "ok";
    ctx.state.baseline.inventory.ryo = ryo - 50;
    const c = ctx.state.baseline.characters[charId];
    if (c) c.affection += 1;
    const charName = ctx.game.characters.find((x) => x.id === charId)?.name ?? charId;
    ctx.state.runtime.pendingNarrations.push(
      `${charName}に贈り物を渡した。受け取り際の目が、いつもより少しだけ柔らかい。`,
    );
    return "ok";
  }
  if (activityId === "hub:sell_all_loot") {
    let total = 0;
    const lines: string[] = [];
    for (const [itemId, count] of Object.entries(ctx.state.baseline.inventory)) {
      if (!isLoot(ctx, itemId) || count <= 0) continue;
      const val = sellValue(ctx, itemId) * count;
      total += val;
      lines.push(`${itemName(ctx, itemId)} ×${count} → ${val}両`);
      delete ctx.state.baseline.inventory[itemId];
    }
    ctx.state.baseline.inventory.ryo =
      (ctx.state.baseline.inventory.ryo ?? 0) + total;
    ctx.state.runtime.pendingNarrations.push(
      `炼器師に納めた：${lines.join("、")}。合計 ${total} 両。`,
    );
    return "ok";
  }
  if (activityId === "hub:upgrade_weapon") {
    const shards = ctx.state.baseline.inventory.soul_shard ?? 0;
    const ryo = ctx.state.baseline.inventory.ryo ?? 0;
    if (shards < 3 || ryo < 100) return "ok";
    const nextShards = shards - 3;
    if (nextShards <= 0) delete ctx.state.baseline.inventory.soul_shard;
    else ctx.state.baseline.inventory.soul_shard = nextShards;
    ctx.state.baseline.inventory.ryo = ryo - 100;
    const wid = ctx.state.baseline.equippedWeaponId;
    if (wid) {
      const w = ctx.state.baseline.weapons[wid];
      if (w) w.power = w.power + 2;
    }
    ctx.state.runtime.pendingNarrations.push(
      `炼器師は無言で碎片を炉に投じた。一夜明け、妖刀の刃に新しい紋様が浮いている——威力 +2。`,
    );
    return "ok";
  }
  if (activityId === "hub:rest") {
    setFlag(ctx, "hp", getFlag(ctx, "hpMax"));
    setFlag(ctx, "mental", getFlag(ctx, "mentalMax"));
    ctx.state.runtime.pendingNarrations.push(
      `宿で一晩明かす。体力と精神を回復した。霊体化は鎮まらないが、刀は静かに鞘に収まっている。`,
    );
    return "ok";
  }
  if (activityId === "hub:use_chinkonho") {
    if (!ctx.state.baseline.knownSkills.includes("chinkonho")) return "ok";
    const spec = getFlag(ctx, "spectral");
    if (spec < 10) return "ok";
    setFlag(ctx, "spectral", Math.max(0, spec - 20));
    ctx.state.runtime.pendingNarrations.push(
      `刀を逆手に取り、心臓の真上に当てる。長く、一度息を吐く。胸の奥でうねっていたものが、二十、押し戻された。`,
    );
    return "ok";
  }

  // ────────── RAID-side ──────────
  if (activityId.startsWith("raid:move:")) {
    const target = activityId.slice("raid:move:".length);
    if (!m.raid) return "ok";
    const cur = m.raid.zones[m.raid.currentZoneId]!;
    const conn = cur.connections.find((c) => c.target === target);
    if (!conn) return "ok";
    m.raid.currentZoneId = target;
    m.raid.turnsTaken += 1;
    const zone = m.raid.zones[target]!;
    if (!zone.visited) {
      zone.visited = true;
      zone.pendingLoot = rollLoot(ctx, zone);
      zone.encounter = rollEncounter(ctx, zone);

      // Character spawn check: rolls against character_spawns rules.
      // If a rule fires, we launch the encounter script INSTEAD of
      // narrating zone entry. The script runs in the preset's main
      // loop the next iteration. Combat/loot interactions are deferred
      // until the script returns control.
      const spawnedChar = rollCharacterSpawn(ctx, m.raid.mapId, target);
      if (spawnedChar) {
        m.metCharacters.push(spawnedChar.characterId);
        // Set the launch target; preset picks it up on next iter.
        ctx.state.baseline.currentScriptId = spawnedChar.encounterScriptId;
        ctx.state.baseline.beatIndex = 0;
        return "ok";
      }

      if (zone.encounter) {
        const intro = getEnemyNarration(ctx, zone.encounter.enemyId, "intro");
        if (intro) {
          ctx.state.runtime.pendingNarrations.push(
            fillTemplate(intro, {
              name: enemyName(ctx, zone.encounter.enemyId),
              hp: zone.encounter.enemyHpMax,
            }),
          );
        }
      } else {
        ctx.state.runtime.pendingNarrations.push(
          `${zone.name}に出る。静かだ。`,
        );
      }
    } else {
      ctx.state.runtime.pendingNarrations.push(
        `${zone.name}に戻る。一度通った道。`,
      );
    }
    return "ok";
  }
  if (activityId === "raid:search") {
    if (!m.raid) return "ok";
    const zone = m.raid.zones[m.raid.currentZoneId]!;
    if (zone.searched) return "ok";
    zone.searched = true;
    const lines: string[] = [];
    for (const [itemId, count] of Object.entries(zone.pendingLoot)) {
      if (count <= 0) continue;
      m.raid.pendingLoot[itemId] = (m.raid.pendingLoot[itemId] ?? 0) + count;
      lines.push(`${itemName(ctx, itemId)} ×${count}`);
    }
    ctx.state.runtime.pendingNarrations.push(
      lines.length > 0
        ? `${zone.name}を探った。見つけたもの：${lines.join("、")}。`
        : `${zone.name}は何もなかった。`,
    );
    return "ok";
  }
  if (activityId === "raid:attack") {
    doAttackRound(ctx, "normal");
    return "ok";
  }
  if (activityId === "raid:sneak_strike") {
    doAttackRound(ctx, "sneak");
    return "ok";
  }
  if (activityId === "raid:flee") {
    doFlee(ctx);
    return "ok";
  }
  if (activityId === "raid:extract") {
    if (!m.raid) return "ok";
    const zone = m.raid.zones[m.raid.currentZoneId]!;
    if (!zone.isExtract) return "ok";
    endRaidExtract(ctx);
    return "ok";
  }

  // Unknown
  ctx.state.runtime.pendingNarrations.push(`(未対応のアクション：${activityId})`);
  return "ok";
}

// ============================================================================
// Triggers: HP <= 0 or spectral >= 100 during a raid → failure
// ============================================================================

const triggers: Trigger[] = [
  {
    id: "raid_death_hp",
    when: { flag: { name: "hp", max: 0 } },
    do: (ctx) => {
      const m = moduleState(ctx);
      if (m.mode === "raid") {
        endRaidFailure(ctx, "体力が尽きた");
      }
      return {};
    },
  },
  {
    id: "raid_death_spectral",
    when: { flag: { name: "spectral", min: 100 } },
    do: (ctx) => {
      const m = moduleState(ctx);
      if (m.mode === "raid") {
        endRaidFailure(ctx, "霊体化が振り切れた");
      }
      return {};
    },
  },
];

// ============================================================================
// Module declaration
// ============================================================================

const raidModule: Module = {
  id: MODULE_ID,
  version: "0.2.0",

  initialize: (_game: Game): RaidModuleState => ({
    mode: "hub",
    raid: null,
    metCharacters: [],
  }),

  onSessionStart: (ctx) => {
    for (const [key, value] of Object.entries(STAT_DEFAULTS)) {
      if (ctx.state.baseline.flags[key] === undefined) {
        ctx.state.baseline.flags[key] = value;
      }
    }
    if (ctx.state.baseline.inventory.ryo === undefined) {
      ctx.state.baseline.inventory.ryo = 100;
    }
    if (
      !ctx.state.baseline.completedScripts.includes("000_intro") &&
      ctx.scriptMap.has("000_intro") &&
      ctx.state.baseline.currentScriptId === null
    ) {
      ctx.state.baseline.currentScriptId = "000_intro";
      ctx.state.baseline.beatIndex = 0;
    }
  },

  triggers,

  onHubBuild: (ctx) => {
    const m = moduleState(ctx);
    return m.mode === "hub" ? buildHubMenu(ctx) : buildRaidMenu(ctx);
  },
};

export default raidModule;
