// sengoku-raid: the headless extraction-shooter module. Reference
// implementation for "what an RPGMaker-native autogal module looks
// like" after Phase 6.
//
// Owns:
//   - mode flag (HUB / RAID), per-raid sub-state (current zone,
//     encounter, pending loot), and the metCharacters tracker — all
//     in the module's own state slice at state["sengoku-raid"]
//   - the hub menu (mode-dependent activities) via onHubBuild
//   - 12 raid/hub action handlers declared via module.actionHandlers
//     + provides. Dispatched by the engine's standard
//     actionHandlerRegistry; activities carry actionKind + payload
//     so the engine routes Input.doActivity through one code path.
//   - reactive triggers: death (player.hp ≤ 0), spectral overload
//     (player.spectral ≥ 100)
//
// Storage layout:
//   - Player stats (HP / mental / spectral / intellect) live on the
//     `player` character (characters/player.md) with declared
//     min/max. Engine clamps on every mutateState write.
//   - raidsCompleted / raidsFailed are declared variables (game.yaml).
//   - Maps load via the engine's parser as a first-class resource
//     (maps/*.yaml → ctx.game.maps / ctx.mapMap). The module reads
//     them; it no longer touches the filesystem.
//
// Why not the training preset?
//   We want raid/hub modes instead of day/slot calendar, and we want
//   our onHubBuild to win first-wins. Skipping game.training avoids
//   both.

import { evaluateCondition } from "@autogal/engine";
import type {
  ActionContext,
  ActionHandler,
  ActionResult,
  CharacterSpawnRule,
  ComposedState,
  Game,
  HubActivity,
  Input,
  MapDef,
  MapZoneDef,
  Module,
  Output,
  PresetContext,
  StateDelta,
  Trigger,
} from "@autogal/engine";

// Most helpers take a minimal ctx (state + game + rng) so they work for
// both PresetContext callers (the preset / onHubBuild) and ActionContext
// callers (handler dispatch). RNG is optional because pure-read helpers
// don't need it.
type Ctx = {
  state: ComposedState;
  game: Game;
  rng: () => number;
};

const MODULE_ID = "sengoku-raid";

// ============================================================================
// Player stats live on the `player` character (characters/player.md)
// with declared min/max — the engine clamps automatically through
// mutateState. `playerStat` / `setPlayerStat` are thin readers/writers
// kept until R2 converts every site to ActionResult { deltas } returns.
// ============================================================================

type PlayerStat = "hp" | "mental" | "spectral" | "intellect";

function playerStat(ctx: Ctx, name: PlayerStat): number {
  return ctx.state.baseline.characters.player?.stats[name] ?? 0;
}

function playerStatMax(ctx: Ctx, name: PlayerStat): number {
  return (
    ctx.game.characters.find((c) => c.id === "player")?.stats?.[name]?.max ?? 0
  );
}

function setPlayerStat(
  ctx: Ctx,
  name: PlayerStat,
  value: number,
): void {
  const c = ctx.state.baseline.characters.player;
  if (!c) return;
  const def = ctx.game.characters.find((cd) => cd.id === "player")?.stats?.[
    name
  ];
  const min = def?.min ?? Number.NEGATIVE_INFINITY;
  const max = def?.max ?? Number.POSITIVE_INFINITY;
  c.stats[name] = Math.max(min, Math.min(max, value));
}

type GameVariable = "raidsCompleted" | "raidsFailed";

function getVar(ctx: Ctx, name: GameVariable): number {
  const v = ctx.state.baseline.variables[name];
  return typeof v === "number" ? v : 0;
}

function setVar(ctx: Ctx, name: GameVariable, value: number): void {
  ctx.state.baseline.variables[name] = value;
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
    // Set true when HP drops below 30% — unlocks negotiate options in
    // buildRaidMenu. Cleared automatically when the encounter resolves
    // (encounter goes null).
    negotiable?: boolean;
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
  // Currently-invited companion. Cleared on raid end (success or
  // failure) regardless of HP. The companion's switch
  // `companion_<id>` is the player-facing source of truth — that
  // is what onChoicePresented / onBeatBefore key on.
  companion: string | null;
  // Companion HP for current raid. 10 cap. When this hits 0 the
  // companion is downed → affection -3, switch flipped off,
  // companion_downed variable += 1.
  companionHp: number;
}

function moduleState(ctx: Ctx): RaidModuleState {
  const s = ctx.state[MODULE_ID] as RaidModuleState | undefined;
  if (!s) throw new Error(`${MODULE_ID}: module state missing`);
  return s;
}

// ============================================================================
// Maps — loaded by the engine's parser as a first-class resource type
// (packages/parser/src/map.ts). Module consumes them via ctx.game.maps
// or the per-id ctx.mapMap lookup that buildPresetContext exposes.
// ============================================================================

function getMap(ctx: Ctx, mapId: string): MapDef | undefined {
  return ctx.game.maps?.find((m) => m.id === mapId);
}

function discoverableMaps(ctx: Ctx): string[] {
  // For now all maps are always discoverable. Future: gate harder maps
  // behind raidsCompleted thresholds or quest flags.
  return (ctx.game.maps ?? [])
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty)
    .map((m) => m.id);
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

function buildSnapshot(activities: HubActivity[], ctx: Ctx): Output {
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

function buildStatSnapshots(ctx: Ctx) {
  const ryo = ctx.state.baseline.inventory.ryo ?? 0;
  return [
    {
      id: "hp",
      name: "体力",
      value: playerStat(ctx, "hp"),
      min: 0,
      max: playerStatMax(ctx, "hp"),
      thresholds: [
        { min: 0, label: "瀕死", color: "red" as const },
        { min: 6, label: "負傷", color: "yellow" as const },
        { min: 15, label: "万全", color: "green" as const },
      ],
    },
    {
      id: "mental",
      name: "精神",
      value: playerStat(ctx, "mental"),
      min: 0,
      max: playerStatMax(ctx, "mental"),
      thresholds: [
        { min: 0, label: "崩壊", color: "red" as const },
        { min: 3, label: "安定", color: "green" as const },
      ],
    },
    {
      id: "spectral",
      name: "霊体化",
      value: playerStat(ctx, "spectral"),
      min: 0,
      max: 100,
      thresholds: [
        { min: 0, label: "平穏", color: "green" as const },
        { min: 20, label: "覚醒", color: "cyan" as const },
        { min: 50, label: "危険", color: "yellow" as const },
        { min: 80, label: "暴走寸前", color: "red" as const },
      ],
    },
    { id: "intellect", name: "学識", value: playerStat(ctx, "intellect"), min: 0, max: 99 },
    { id: "ryo", name: "両", value: ryo, min: 0, max: 99999 },
  ];
}

function buildAffectionSnapshots(ctx: Ctx) {
  const m = moduleState(ctx);
  return ctx.game.characters
    .filter((c) => m.metCharacters.includes(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: ctx.state.baseline.characters[c.id]?.affection ?? 0,
    }));
}

function buildHubMenu(ctx: Ctx): Output {
  const m = moduleState(ctx);
  const activities: HubActivity[] = [];

  // Per-character bonding: hub-side gift + scripted bond scenes.
  // The bond scripts are static files (scripts/bond_<id>_NN.md) with
  // affection-gated `requires:` clauses. They're surfaced here as
  // "script:" activities, dispatched through the engine's standard
  // dispatch (NOT the raid module's prefix), so script completion
  // hooks fire normally and the script gets logged to completionOrder.
  for (const charId of m.metCharacters) {
    const char = ctx.game.characters.find((c) => c.id === charId);
    if (!char) continue;
    const ryo = ctx.state.baseline.inventory.ryo ?? 0;
    activities.push({
      id: `bond:${charId}`,
      kind: "action",
      actionKind: "bond",
      payload: { characterId: charId },
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
      if (ctx.state.baseline.scripts[script.id]?.completed === true) continue;
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

  // zone_haunt_<enemy> — one-shot lore scripts that unlock when the
  // player has *released* (negotiated free) an enemy of that type
  // at least once. Selfswitch A on the script is the unlock gate;
  // script `requires:` reads it. Once played, script.completed is
  // true and it disappears from the hub.
  for (const script of ctx.game.scripts) {
    if (!script.id.startsWith("zone_haunt_")) continue;
    if (ctx.state.baseline.scripts[script.id]?.completed === true) continue;
    const reqs = script.requires;
    const eligible = reqs === undefined || evaluateCondition(reqs, ctx.state);
    if (!eligible) continue;
    activities.push({
      id: `script:${script.id}`,
      kind: "script",
      title: `回想 — ${script.title}`,
      category: "social",
      cost: 0,
      available: true,
    });
  }

  // Sell loot
  const lootIds = Object.entries(ctx.state.baseline.inventory).filter(
    ([id, n]) => n > 0 && isLoot(ctx, id),
  );
  if (lootIds.length > 0) {
    const total = lootIds.reduce((sum, [id, n]) => sum + n * sellValue(ctx, id), 0);
    activities.push({
      id: "sell_all_loot",
      kind: "action",
      actionKind: "sell_all_loot",
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
    id: "upgrade_weapon",
    kind: "action",
    actionKind: "upgrade_weapon",
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
  const hp = playerStat(ctx, "hp");
  const hpMax = playerStatMax(ctx, "hp");
  if (hp < hpMax) {
    activities.push({
      id: "rest",
      kind: "action",
      actionKind: "rest",
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
    const spec = playerStat(ctx, "spectral");
    activities.push({
      id: "use_chinkonho",
      kind: "action",
      actionKind: "use_chinkonho",
      title: "鎮魂法を行う（霊体化 -20）",
      description: "篝伝授の口伝。集中して長く息を吐く",
      category: "spirit",
      cost: 0,
      available: spec >= 10,
      lockedReason: spec >= 10 ? undefined : "霊体化が低すぎて鎮める意味がない",
    });
  }

  // 同行者システム — invite a met character with affection >= 4.
  // Only one companion at a time. Flipping a companion_<id> switch
  // is what onChoicePresented / onBeatBefore key on; m.companion is
  // the runtime mirror.
  for (const charId of m.metCharacters) {
    const char = ctx.game.characters.find((c) => c.id === charId);
    if (!char) continue;
    const affection =
      ctx.state.baseline.characters[charId]?.stats.affection ?? 0;
    if (affection < 4) continue;
    const alreadyInvited = m.companion === charId;
    activities.push({
      id: `invite:${charId}`,
      kind: "action",
      actionKind: "invite",
      payload: { characterId: charId },
      title: alreadyInvited
        ? `${char.name}を同行から外す`
        : `${char.name}を次の出帰りに誘う`,
      description: alreadyInvited
        ? "同行を解く（次の出立では一人）"
        : "親密度 4 以上で同行可。他者を誘うと自動的に交代",
      category: "social",
      cost: 0,
      available: true,
    });
  }

  // Depart on raid
  for (const mapId of discoverableMaps(ctx)) {
    const map = getMap(ctx, mapId);
    if (!map) continue;
    const hpFull = hp >= hpMax;
    activities.push({
      id: `depart:${mapId}`,
      kind: "action",
      actionKind: "depart",
      payload: { mapId },
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

function buildRaidMenu(ctx: Ctx): Output {
  const m = moduleState(ctx);
  if (!m.raid) return buildHubMenu(ctx);

  const zone = m.raid.zones[m.raid.currentZoneId];
  if (!zone) throw new Error(`${MODULE_ID}: invalid zone ${m.raid.currentZoneId}`);

  const activities: HubActivity[] = [];

  if (zone.encounter) {
    activities.push({
      id: "attack",
      kind: "action",
      actionKind: "attack",
      title: `斬る — ${enemyName(ctx, zone.encounter.enemyId)}（HP ${zone.encounter.enemyHp}/${zone.encounter.enemyHpMax}）`,
      description: "妖刀威力 × (1 + 霊体化×0.04) × ばらつき",
      category: "combat",
      cost: 0,
      available: true,
    });
    activities.push({
      id: "sneak_strike",
      kind: "action",
      actionKind: "sneak_strike",
      title: "不意打ちを狙う",
      description: "学識+霊体化判定。成功で大ダメージ、失敗で外す",
      category: "combat",
      cost: 0,
      available: true,
    });
    activities.push({
      id: "flee",
      kind: "action",
      actionKind: "flee",
      title: "逃げる",
      description: "霊体化判定。失敗で一発被弾",
      category: "combat",
      cost: 0,
      available: true,
    });
    // 鬼の交渉 — only when the enemy is at or below 30% HP
    // (flag set by doAttackRound). Three branches:
    //   listen — free chat, may yield negotiate_drop based on cunning
    //   release — set selfSwitch unlocking a zone_haunt lore script;
    //             spectral -2, encounter cleared, no loot
    //   yaodao voice — composite gate (spectral ≥ 50); guaranteed
    //                  finish + spectral cost + pulse_oni +1
    if (zone.encounter.negotiable) {
      const cunning = enemyCunning(ctx, zone.encounter.enemyId);
      activities.push({
        id: "negotiate_listen",
        kind: "action",
        actionKind: "negotiate_listen",
        title: `聞き出す — ${enemyName(ctx, zone.encounter.enemyId)}`,
        description: `成功率 ${negotiateDropChance(cunning)}%（cunning ${cunning}）。失敗でも斬り直せる`,
        category: "combat",
        cost: 0,
        available: true,
      });
      activities.push({
        id: "negotiate_release",
        kind: "action",
        actionKind: "negotiate_release",
        title: `逃がす — ${enemyName(ctx, zone.encounter.enemyId)}`,
        description: "霊体化 -2、戦利品なし、その鬼種の zone_haunt 解錠",
        category: "combat",
        cost: 0,
        available: true,
      });
      const spec = playerStat(ctx, "spectral");
      const voiceAvailable = spec >= 50;
      activities.push({
        id: "yaodao_voice",
        kind: "action",
        actionKind: "yaodao_voice",
        title: voiceAvailable
          ? "妖刀の声に従う — 必殺の一閃（霊体化 +5、脈絡: 鬼 +1）"
          : "妖刀の声（霊体化が低くて聞こえない）",
        description: "4 倍の威力で必ず止め。脈絡選択は強制「鬼」",
        category: "combat",
        cost: 0,
        available: voiceAvailable,
        lockedReason: voiceAvailable
          ? undefined
          : `霊体化 ≥ 50 が要る（現在 ${spec}）`,
      });
    }
  } else {
    if (!zone.searched && Object.keys(zone.pendingLoot).length > 0) {
      activities.push({
        id: "search",
        kind: "action",
        actionKind: "search",
        title: "この区域を探る",
        category: "raid",
        cost: 0,
        available: true,
      });
    }
    if (zone.isExtract) {
      activities.push({
        id: "extract",
        kind: "action",
        actionKind: "extract",
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
        id: `move:${conn.target}`,
        kind: "action",
        actionKind: "move",
        payload: { zoneId: conn.target },
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

// "Loot" = any item whose .md frontmatter carries a numeric `sell_value`
// — the炼器師 collects them. Item .md files are loaded by the engine
// (parseItem) which now preserves unknown fields on item.custom, so
// adding a new sellable item is purely a content change (drop a new
// items/<id>.md with a `sell_value:` line).
function isLoot(ctx: Ctx, itemId: string): boolean {
  return typeof sellValueOf(ctx, itemId) === "number";
}

function sellValue(ctx: Ctx, itemId: string): number {
  return sellValueOf(ctx, itemId) ?? 0;
}

function sellValueOf(ctx: Ctx, itemId: string): number | undefined {
  const item = ctx.game.items?.find((i) => i.id === itemId);
  const v = item?.custom?.sell_value;
  return typeof v === "number" ? v : undefined;
}

function itemName(ctx: Ctx, itemId: string): string {
  return ctx.game.items?.find((i) => i.id === itemId)?.name ?? itemId;
}

function enemyName(ctx: Ctx, enemyId: string): string {
  return ctx.game.enemies?.find((e) => e.id === enemyId)?.name ?? enemyId;
}

function enemyAttackPower(ctx: Ctx, enemyId: string): number {
  const e = ctx.game.enemies?.find((x) => x.id === enemyId);
  if (!e) return 1;
  const raw = e.custom?.attack_power;
  return typeof raw === "number" ? raw : 1;
}

function enemyHp(ctx: Ctx, enemyId: string): number {
  return ctx.game.enemies?.find((e) => e.id === enemyId)?.hp ?? 1;
}

// 鬼の交渉 — uses enemy.stats.cunning to modulate listen success.
function enemyCunning(ctx: Ctx, enemyId: string): number {
  const e = ctx.game.enemies?.find((x) => x.id === enemyId);
  return e?.stats?.cunning ?? 1;
}

function enemyNegotiateLore(ctx: Ctx, enemyId: string): string | undefined {
  const v = ctx.game.enemies?.find((x) => x.id === enemyId)?.custom?.negotiate_lore;
  return typeof v === "string" ? v : undefined;
}

function enemyNegotiateDrop(ctx: Ctx, enemyId: string): string | undefined {
  const v = ctx.game.enemies?.find((x) => x.id === enemyId)?.custom?.negotiate_drop;
  return typeof v === "string" ? v : undefined;
}

// Listen success chance: 60 - cunning*10, floored at 10%.
function negotiateDropChance(cunning: number): number {
  return Math.max(10, 60 - cunning * 10);
}

function getEnemyNarration(
  ctx: Ctx,
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

function getSwordPower(ctx: Ctx): number {
  const id = ctx.state.baseline.equippedWeaponId;
  if (!id) return 1;
  return ctx.state.baseline.weapons[id]?.power ?? 1;
}

// ============================================================================
// Dispatcher guards (issues #10 + #11)
// ============================================================================
// Returns a denial message if the current zone has an active encounter,
// or null when it's safe to do non-combat actions. Centralized so all
// three callers (move/search/extract) use the same invariant.
function combatBlock(ctx: Ctx): string | null {
  const m = moduleState(ctx);
  if (!m.raid) return null;
  const zone = m.raid.zones[m.raid.currentZoneId];
  if (zone?.encounter) {
    return `${enemyName(ctx, zone.encounter.enemyId)}に背を向けるわけにはいかぬ。斬るか、抜けるかだ。`;
  }
  return null;
}

// ============================================================================
// Raid lifecycle
// ============================================================================

function startRaid(ctx: Ctx, mapId: string): void {
  const map = getMap(ctx, mapId);
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
  ctx: Ctx,
  zone: ZoneInstance,
): null | { enemyId: string; enemyHp: number; enemyHpMax: number } {
  if (zone.encounterTable.length === 0) return null;
  const pick = pickWeighted(ctx.rng, zone.encounterTable);
  if (pick.enemyId === null) return null;
  const hp = enemyHp(ctx, pick.enemyId);
  return { enemyId: pick.enemyId, enemyHp: hp, enemyHpMax: hp };
}

function rollCharacterSpawn(
  ctx: Ctx,
  mapId: string,
  zoneId: string,
): CharacterSpawnRule | null {
  const map = getMap(ctx, mapId);
  if (!map?.characterSpawns) return null;
  const m = moduleState(ctx);
  for (const rule of map.characterSpawns) {
    if (m.metCharacters.includes(rule.characterId)) continue;
    if (!rule.zones.includes(zoneId)) continue;
    if (ctx.rng() <= rule.chance) return rule;
  }
  return null;
}

function rollLoot(ctx: Ctx, zone: ZoneInstance): Record<string, number> {
  if (zone.lootTable.length === 0) return {};
  const pick = pickWeighted(ctx.rng, zone.lootTable);
  if (pick.itemId === null) return {};
  const count = rollIntInclusive(ctx.rng, pick.min, pick.max);
  return { [pick.itemId]: count };
}

// Clear companion state on raid end. Switches stay set (player kept
// the bond between raids); only the runtime "in party right now" flag
// resets so the player has to re-invite each raid (otherwise the
// system feels less like a deliberate decision).
function clearCompanionAfterRaid(ctx: Ctx): void {
  const m = moduleState(ctx);
  if (!m.companion) return;
  ctx.state.baseline.switches[`companion_${m.companion}`] = false;
  m.companion = null;
  m.companionHp = 0;
}

function endRaidExtract(ctx: Ctx): void {
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

  // If companion survived the raid (HP > 0), mark the persistent
  // "befriended" switch and grant +1 affection. This is the loop:
  // invite → survive together → unlock deeper bond scenes.
  if (m.companion && m.companionHp > 0) {
    const companionId = m.companion;
    ctx.state.baseline.switches[`befriended_${companionId}`] = true;
    const c = ctx.state.baseline.characters[companionId];
    if (c) c.stats.affection = (c.stats.affection ?? 0) + 1;
    const charName =
      ctx.game.characters.find((x) => x.id === companionId)?.name ?? companionId;
    ctx.state.runtime.pendingNarrations.push(
      `${charName}は無事に大名府まで歩いた。一度共に出帰った仲——刀を握る手の重さが、少し変わる。親密度 +1。`,
    );
  }

  m.raid = null;
  m.mode = "hub";
  setVar(ctx, "raidsCompleted", getVar(ctx, "raidsCompleted") + 1);
  clearCompanionAfterRaid(ctx);

  ctx.state.runtime.pendingNarrations.push(
    `${mapName}から撤退に成功。${lootSummary.length > 0 ? "持ち帰った戦利品：" + lootSummary.join("、") + "。" : "今回は手ぶら。"}`,
  );
}

function endRaidFailure(ctx: Ctx, reason: string): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  const mapName = m.raid.mapName;
  m.raid = null;
  m.mode = "hub";
  setVar(ctx, "raidsFailed", getVar(ctx, "raidsFailed") + 1);
  clearCompanionAfterRaid(ctx);
  // Reset HP/mental/spectral to defaults (death/overload triggered).
  // hp = 1 so player has to rest; mental partial; spectral cut.
  setPlayerStat(ctx, "hp", 1);
  setPlayerStat(ctx, "mental", Math.max(1, Math.floor(playerStatMax(ctx, "mental") / 2)));
  setPlayerStat(ctx, "spectral", Math.max(5, Math.floor(playerStat(ctx, "spectral") / 2)));
  ctx.state.runtime.pendingNarrations.push(
    `${mapName}での討伐は失敗——${reason}。戦利品は全て失われた。気がついたら大名府の御殿医の枕元。`,
  );
}

// Companion damage redirect — called from the enemy counter-attack
// in doAttackRound. If a companion is in party, the companion absorbs
// part of the damage (offers tactical value at risk of downing them).
//
// Returns the residual damage that should still hit the player.
function tryCompanionAbsorb(ctx: Ctx, raw: number): number {
  const m = moduleState(ctx);
  if (!m.companion || m.companionHp <= 0 || !m.raid) return raw;
  const absorbed = Math.min(m.companionHp, Math.ceil(raw / 2));
  m.companionHp -= absorbed;
  const charName =
    ctx.game.characters.find((c) => c.id === m.companion!)?.name ?? m.companion!;
  ctx.state.runtime.pendingNarrations.push(
    `${charName}が割って入った——${absorbed} のダメージを彼女が引き受けた。残り HP ${m.companionHp}/10。`,
  );

  // Downed?
  if (m.companionHp <= 0) {
    const downedName = charName;
    const charId = m.companion;
    m.companion = null;
    m.companionHp = 0;
    ctx.state.baseline.switches[`companion_${charId}`] = false;
    ctx.state.baseline.variables.companion_downed =
      (typeof ctx.state.baseline.variables.companion_downed === "number"
        ? ctx.state.baseline.variables.companion_downed
        : 0) + 1;
    // -3 affection. Engine clamps to character's min if declared.
    const c = ctx.state.baseline.characters[charId!];
    if (c) c.stats.affection = Math.max(0, (c.stats.affection ?? 0) - 3);
    ctx.state.runtime.pendingNarrations.push(
      `${downedName}は倒れた。意識はある——だが、もう刀は握れぬ。お主の中で何かが折れた。親密度 -3。`,
    );
  }
  return raw - absorbed;
}

// ============================================================================
// Combat
// ============================================================================

function doAttackRound(ctx: Ctx, kind: "normal" | "sneak"): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  const zone = m.raid.zones[m.raid.currentZoneId]!;
  if (!zone.encounter) return;

  const sword = getSwordPower(ctx);
  const spec = playerStat(ctx, "spectral");
  const intellect = playerStat(ctx, "intellect");

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
  setPlayerStat(ctx, "spectral", Math.min(100, spec + 1));

  // 鬼の交渉: when an enemy drops below 30% HP, the next raid menu
  // gains 3 conditional activities (listen / release / yaodao-voice).
  // This flag lives on the encounter object so it auto-clears when
  // the encounter resolves (victory / flee / release).
  if (
    zone.encounter.enemyHp > 0 &&
    zone.encounter.enemyHp < zone.encounter.enemyHpMax * 0.3
  ) {
    zone.encounter.negotiable = true;
    ctx.state.runtime.pendingNarrations.push(
      `${enemyName(ctx, zone.encounter.enemyId)}の構えが崩れた——息は荒く、まだ斬れる。だが、聞き出すことも、放すこともできる。`,
    );
  }

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
    setPlayerStat(ctx, "spectral", Math.max(0, playerStat(ctx, "spectral") - absorb));
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
  // 同行者が割って入るかチェック。Companion soaks half (rounded up),
  // remainder hits player. Companion HP=0 → downed (handled inside).
  const residual = tryCompanionAbsorb(ctx, finalEnemyDamage);
  setPlayerStat(ctx, "hp", playerStat(ctx, "hp") - residual);
  ctx.state.runtime.pendingNarrations.push(
    isFumble
      ? `${enemyName(ctx, zone.encounter.enemyId)}の反撃。霊体化が暴れて体が思うように動かず——${residual} のダメージ。`
      : `${enemyName(ctx, zone.encounter.enemyId)}の反撃。${residual} のダメージ。`,
  );
  setPlayerStat(ctx, "mental", Math.max(0, playerStat(ctx, "mental") - 1));
}

function doFlee(ctx: Ctx): void {
  const m = moduleState(ctx);
  if (!m.raid) return;
  const zone = m.raid.zones[m.raid.currentZoneId]!;
  if (!zone.encounter) return;
  const enemyId = zone.encounter.enemyId;

  const m2 = moduleState(ctx);

  // Hayagake (taught by 霞) OR 霞 currently in party — flee always
  // succeeds with no damage/no mental cost.
  if (
    ctx.state.baseline.knownSkills.includes("hayagake") ||
    m2.companion === "kasumi"
  ) {
    const reason = m2.companion === "kasumi" ? "霞の手が手首を取った" : "霞に教わった足運び";
    ctx.state.runtime.pendingNarrations.push(
      `${reason}——${enemyName(ctx, enemyId)}が振り向く半秒前に、お主はもう間合いの外。`,
    );
    zone.encounter = null;
    zone.encounterCleared = true;
    return;
  }

  const spec = playerStat(ctx, "spectral");
  const dc = 30 + spec; // higher spec = harder (you're slow)
  const roll = ctx.rng() * 100;
  if (roll > dc - 10) {
    ctx.state.runtime.pendingNarrations.push(
      `${enemyName(ctx, enemyId)}の隙を縫って退いた。`,
    );
    zone.encounter = null;
    zone.encounterCleared = true;
    setPlayerStat(ctx, "mental", Math.max(0, playerStat(ctx, "mental") - 1));
  } else {
    const dmg = Math.max(2, enemyAttackPower(ctx, enemyId) + 1);
    setPlayerStat(ctx, "hp", playerStat(ctx, "hp") - dmg);
    ctx.state.runtime.pendingNarrations.push(
      `背を見せた瞬間、${enemyName(ctx, enemyId)}に追いつかれた——${dmg} のダメージ。`,
    );
  }
}

// ============================================================================
// Action handlers — declared on the module's actionHandlers map below.
// Engine routes Input.doActivity through actionHandlerRegistry; each
// handler returns ActionResult { narrations? }. Module-private mutations
// (zone state, m.raid sub-state, m.metCharacters) stay in-place because
// they live on the module's own state slice that the engine doesn't
// model in StateDelta. After each handler the engine calls checkTriggers
// unconditionally (engine/src/primitives/applyActionResult.ts) so the
// HP=0 / spectral=100 triggers still fire even when mutations bypass
// StateDelta.
//
// Narrations are returned in the ActionResult so the engine queues
// them through pendingNarrations. The `denial` helper builds an
// ActionResult that carries just the rejection message.
// ============================================================================

function denial(message: string): ActionResult {
  return { narrations: [message] };
}

const departHandler: ActionHandler = (ctx) => {
  const mapId = ctx.action.payload?.mapId as string | undefined;
  if (!mapId) return denial(`出立先が指定されていない。`);
  if (playerStat(ctx, "hp") < playerStatMax(ctx, "hp")) {
    return denial("体力が満たぬ。先に宿で休め。");
  }
  if (!getMap(ctx, mapId)) {
    return denial(`その地は地図にない（${mapId}）。`);
  }
  startRaid(ctx, mapId);
  return {};
};

const bondHandler: ActionHandler = (ctx) => {
  const charId = ctx.action.payload?.characterId as string | undefined;
  if (!charId) return denial("贈る相手が指定されていない。");
  const m = moduleState(ctx);
  const ryo = ctx.state.baseline.inventory.ryo ?? 0;
  if (ryo < 50) return denial(`両が足りない。あと ${50 - ryo} 両要る。`);
  if (!m.metCharacters.includes(charId)) {
    return denial("まだ会ったことのない相手だ。");
  }
  const charName =
    ctx.game.characters.find((x) => x.id === charId)?.name ?? charId;
  return {
    deltas: {
      inventory: { ryo: -50 },
      characterStats: { [charId]: { affection: 1 } },
    },
    narrations: [
      `${charName}に贈り物を渡した。受け取り際の目が、いつもより少しだけ柔らかい。`,
    ],
  };
};

const sellAllLootHandler: ActionHandler = (ctx) => {
  const sellable = Object.entries(ctx.state.baseline.inventory).filter(
    ([id, n]) => n > 0 && isLoot(ctx, id),
  );
  if (sellable.length === 0) return denial("売れる戦利品が手元にない。");

  let total = 0;
  const lines: string[] = [];
  const inventoryDelta: Record<string, number> = {};
  for (const [itemId, count] of sellable) {
    const val = sellValue(ctx, itemId) * count;
    total += val;
    lines.push(`${itemName(ctx, itemId)} ×${count} → ${val}両`);
    inventoryDelta[itemId] = -count;
  }
  inventoryDelta.ryo = (inventoryDelta.ryo ?? 0) + total;
  return {
    deltas: { inventory: inventoryDelta },
    narrations: [`炼器師に納めた：${lines.join("、")}。合計 ${total} 両。`],
  };
};

const upgradeWeaponHandler: ActionHandler = (ctx) => {
  const shards = ctx.state.baseline.inventory.soul_shard ?? 0;
  const ryo = ctx.state.baseline.inventory.ryo ?? 0;
  if (shards < 3) {
    return denial(`炼器師「魂石碎片が足りない。あと ${3 - shards} 枚要る。」`);
  }
  if (ryo < 100) {
    return denial(`炼器師「持ち合わせが ${ryo} 両か。あと ${100 - ryo} 両要る。」`);
  }
  const wid = ctx.state.baseline.equippedWeaponId;
  const deltas: StateDelta = {
    inventory: { soul_shard: -3, ryo: -100 },
  };
  if (wid) deltas.weapons = { [wid]: { power: 2 } };
  return {
    deltas,
    narrations: [
      `炼器師は無言で碎片を炉に投じた。一夜明け、妖刀の刃に新しい紋様が浮いている——威力 +2。`,
    ],
  };
};

const restHandler: ActionHandler = (ctx) => {
  const hp = playerStat(ctx, "hp");
  const hpMax = playerStatMax(ctx, "hp");
  if (hp >= hpMax) {
    return denial("もう休む必要はない。体力は満たされている。");
  }
  return {
    deltas: {
      characterStats: {
        player: {
          hp: hpMax - hp,
          mental: playerStatMax(ctx, "mental") - playerStat(ctx, "mental"),
        },
      },
    },
    narrations: [
      `宿で一晩明かす。体力と精神を回復した。霊体化は鎮まらないが、刀は静かに鞘に収まっている。`,
    ],
  };
};

const useChinkonhoHandler: ActionHandler = (ctx) => {
  if (!ctx.state.baseline.knownSkills.includes("chinkonho")) {
    return denial("鎮魂法はまだ伝授されていない。");
  }
  const spec = playerStat(ctx, "spectral");
  if (spec < 10) {
    return denial("霊体化がまだ低い。今鎮める意味はない。");
  }
  return {
    deltas: {
      characterStats: { player: { spectral: -Math.min(20, spec) } },
    },
    narrations: [
      `刀を逆手に取り、心臓の真上に当てる。長く、一度息を吐く。胸の奥でうねっていたものが、二十、押し戻された。`,
    ],
  };
};

const moveHandler: ActionHandler = (ctx) => {
  const blocker = combatBlock(ctx);
  if (blocker) return denial(blocker);
  const target = ctx.action.payload?.zoneId as string | undefined;
  if (!target) return denial("行き先が指定されていない。");

  const m = moduleState(ctx);
  if (!m.raid) return {};
  const cur = m.raid.zones[m.raid.currentZoneId]!;
  const conn = cur.connections.find((c) => c.target === target);
  if (!conn) return denial(`${cur.name}からそちらへ通じる道はない。`);

  // Module-private state writes (zone graph traversal). The engine
  // doesn't model these in StateDelta — they live on the module's own
  // state slice.
  m.raid.currentZoneId = target;
  m.raid.turnsTaken += 1;
  const zone = m.raid.zones[target]!;

  // 篝同行者 passive: each new zone, spectral -1. Kasumi/mio don't
  // alter movement (kasumi's passive lands in doFlee; mio's in a
  // future scry action).
  if (m.companion === "kagari") {
    const spec = playerStat(ctx, "spectral");
    if (spec > 0) {
      setPlayerStat(ctx, "spectral", Math.max(0, spec - 1));
      ctx.state.runtime.pendingNarrations.push(
        `篝が刀を握り直す。歩を合わせるたび、胸の奥のものが一寸だけ静かになる——霊体化 -1。`,
      );
    }
  }

  if (zone.visited) {
    return { narrations: [`${zone.name}に戻る。一度通った道。`] };
  }
  zone.visited = true;
  zone.pendingLoot = rollLoot(ctx, zone);
  zone.encounter = rollEncounter(ctx, zone);

  // Character spawn check. If a rule fires, launch the encounter
  // script instead of narrating zone entry. Setting currentScriptId
  // is engine-state mutation but predates StateDelta; the preset's
  // run loop picks it up next iteration.
  const spawnedChar = rollCharacterSpawn(ctx, m.raid.mapId, target);
  if (spawnedChar) {
    m.metCharacters.push(spawnedChar.characterId);
    ctx.state.baseline.currentScriptId = spawnedChar.encounterScriptId;
    ctx.state.baseline.beatIndex = 0;
    return {};
  }

  if (zone.encounter) {
    const intro = getEnemyNarration(ctx, zone.encounter.enemyId, "intro");
    if (intro) {
      return {
        narrations: [
          fillTemplate(intro, {
            name: enemyName(ctx, zone.encounter.enemyId),
            hp: zone.encounter.enemyHpMax,
          }),
        ],
      };
    }
    return {};
  }
  return { narrations: [`${zone.name}に出る。静かだ。`] };
};

const searchHandler: ActionHandler = (ctx) => {
  const blocker = combatBlock(ctx);
  if (blocker) return denial(blocker);
  const m = moduleState(ctx);
  if (!m.raid) return {};
  const zone = m.raid.zones[m.raid.currentZoneId]!;
  if (zone.searched) return denial(`${zone.name}はもう探った。`);

  zone.searched = true;
  const lines: string[] = [];
  for (const [itemId, count] of Object.entries(zone.pendingLoot)) {
    if (count <= 0) continue;
    m.raid.pendingLoot[itemId] = (m.raid.pendingLoot[itemId] ?? 0) + count;
    lines.push(`${itemName(ctx, itemId)} ×${count}`);
  }
  return {
    narrations: [
      lines.length > 0
        ? `${zone.name}を探った。見つけたもの：${lines.join("、")}。`
        : `${zone.name}は何もなかった。`,
    ],
  };
};

const attackHandler: ActionHandler = (ctx) => {
  doAttackRound(ctx, "normal");
  return {};
};

const sneakStrikeHandler: ActionHandler = (ctx) => {
  doAttackRound(ctx, "sneak");
  return {};
};

const fleeHandler: ActionHandler = (ctx) => {
  doFlee(ctx);
  return {};
};

// 鬼の交渉 — three branches, all only valid when the encounter is
// marked negotiable (HP < 30%). Module guards check this; if the
// encounter isn't negotiable the handler returns a denial.

const negotiateListenHandler: ActionHandler = (ctx) => {
  const m = moduleState(ctx);
  if (!m.raid) return denial("交渉できる相手がいない。");
  const zone = m.raid.zones[m.raid.currentZoneId];
  if (!zone?.encounter?.negotiable) {
    return denial("まだ斬れるうちに聞き出すには弱らせろ。");
  }
  const enemyId = zone.encounter.enemyId;
  const cunning = enemyCunning(ctx, enemyId);
  const lore = enemyNegotiateLore(ctx, enemyId);
  const dropId = enemyNegotiateDrop(ctx, enemyId);
  const chance = negotiateDropChance(cunning);
  const success = ctx.rng() * 100 < chance;

  const narrations: string[] = [];
  if (lore) narrations.push(lore);

  const deltas: StateDelta = {};
  if (success && dropId) {
    deltas.inventory = { [dropId]: 1 };
    narrations.push(
      `${enemyName(ctx, enemyId)}は最後に何かを差し出して、霧に溶けた——${itemName(ctx, dropId)} ×1。`,
    );
  } else {
    narrations.push(
      `${enemyName(ctx, enemyId)}の声は途切れた。差し出されたものは何もない。`,
    );
  }

  // Listening "consumes" the negotiation moment; encounter still alive
  // but no longer negotiable — player must commit (attack / flee).
  zone.encounter.negotiable = false;
  return { deltas, narrations };
};

const negotiateReleaseHandler: ActionHandler = (ctx) => {
  const m = moduleState(ctx);
  if (!m.raid) return denial("放す相手がいない。");
  const zone = m.raid.zones[m.raid.currentZoneId];
  if (!zone?.encounter?.negotiable) {
    return denial("斬れる距離まで弱らせろ。");
  }
  const enemyId = zone.encounter.enemyId;
  const enemyTitle = enemyName(ctx, enemyId);

  zone.encounter = null;
  zone.encounterCleared = true;

  // selfSwitch A on the zone_haunt_<enemy> script: persists across
  // raids, unlocks the haunt lore script in hub. This is what makes
  // selfSwitch meaningful — a one-time, script-scoped permanent flag
  // that's neither a global switch nor a variable.
  return {
    deltas: {
      characterStats: { player: { spectral: -2 } },
      selfSwitches: {
        [`zone_haunt_${enemyId}`]: { A: true },
      },
    },
    narrations: [
      `お主は刀を引いた。${enemyTitle}は霧に滲んでいく——その目に、礼に似たものが浮かんだ気がした。霊体化 -2。`,
    ],
  };
};

const yaodaoVoiceHandler: ActionHandler = (ctx) => {
  const m = moduleState(ctx);
  if (!m.raid) return denial("ここでは聞こえぬ声だ。");
  const zone = m.raid.zones[m.raid.currentZoneId];
  if (!zone?.encounter?.negotiable) {
    return denial("妖刀が応える気配は無い——まだ早い。");
  }
  if (playerStat(ctx, "spectral") < 50) {
    return denial("霊体化が低くて、刀の声が聞こえない。");
  }
  const enemyId = zone.encounter.enemyId;
  const hpMax = zone.encounter.enemyHpMax;
  const swordGain = Math.max(2, Math.floor(hpMax / 2));

  // Finisher: no need to compute damage, the encounter is forced over.
  zone.encounter = null;
  zone.encounterCleared = true;

  const wid = ctx.state.baseline.equippedWeaponId;
  const deltas: StateDelta = {
    characterStats: { player: { spectral: 5 } },
    variables: { pulse_oni: 1 },
  };
  if (wid) deltas.weapons = { [wid]: { power: swordGain } };

  return {
    deltas,
    narrations: [
      `刀が鳴いた。胸の奥のものが舌を出した——${enemyName(ctx, enemyId)}は、一閃で四つに別れた。霊体化 +5、妖刀威力 +${swordGain}、脈絡: 鬼 +1。`,
    ],
  };
};

const extractHandler: ActionHandler = (ctx) => {
  const blocker = combatBlock(ctx);
  if (blocker) return denial(blocker);
  const m = moduleState(ctx);
  if (!m.raid) return {};
  const zone = m.raid.zones[m.raid.currentZoneId]!;
  if (!zone.isExtract) {
    return denial(`${zone.name}は撤退点ではない。社か杜まで戻れ。`);
  }
  endRaidExtract(ctx);
  return {};
};

// 同行者 invite/uninvite handler. Toggles companion + the public
// `companion_<id>` switch (hooks key off the switch since switches are
// in the engine-modeled state, not module-private).
const inviteHandler: ActionHandler = (ctx) => {
  const charId = ctx.action.payload?.characterId as string | undefined;
  if (!charId) return denial("誰を誘うか指定されていない。");
  const m = moduleState(ctx);
  if (!m.metCharacters.includes(charId)) {
    return denial("会ったことのない相手は誘えない。");
  }
  if (m.mode === "raid") {
    return denial("出立後は誘えない。大名府に戻ってから。");
  }
  const affection =
    ctx.state.baseline.characters[charId]?.stats.affection ?? 0;
  if (affection < 4 && m.companion !== charId) {
    return denial("まだ同行を頼める仲ではない（親密度 4 が要る）。");
  }
  const charName =
    ctx.game.characters.find((c) => c.id === charId)?.name ?? charId;

  // Toggle off if already invited.
  if (m.companion === charId) {
    m.companion = null;
    m.companionHp = 0;
    return {
      deltas: { switches: { [`companion_${charId}`]: false } },
      narrations: [`${charName}に同行を解いた旨を伝えた。`],
    };
  }

  // Replace any prior companion, flip switches accordingly.
  const switches: Record<string, boolean> = {
    [`companion_${charId}`]: true,
  };
  if (m.companion) {
    switches[`companion_${m.companion}`] = false;
  }
  m.companion = charId;
  m.companionHp = 10;
  return {
    deltas: { switches },
    narrations: [
      `${charName}は頷いた。「次の出帰り、隣で歩く。」`,
    ],
  };
};

// ============================================================================
// Triggers: HP <= 0 or spectral >= 100 during a raid → failure
// ============================================================================

// Queue a letter script — but only when we're safely in the hub between
// scripts. If the player is mid-script (very rare; only if a trigger
// somehow fires during a script's effects block), the chapter advance
// still happens via the delta below, and onHubBuild can show a "未読の
// 文" hint until the next hub cycle. The next time `currentScriptId`
// becomes null in the run loop, the letter will queue.
function queueLetterIfHub(ctx: PresetContext, scriptId: string): void {
  if (ctx.state.baseline.currentScriptId === null) {
    ctx.state.baseline.currentScriptId = scriptId;
    ctx.state.baseline.beatIndex = 0;
  }
}

const triggers: Trigger[] = [
  {
    id: "raid_death_hp",
    when: { characterStat: { character: "player", name: "hp", max: 0 } },
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
    when: { characterStat: { character: "player", name: "spectral", min: 100 } },
    do: (ctx) => {
      const m = moduleState(ctx);
      if (m.mode === "raid") {
        endRaidFailure(ctx, "霊体化が振り切れた");
      }
      return {};
    },
  },
  // ============== 主線：将軍家からの密書 milestones ==============
  // Each letter fires once per session (`once: true`); the engine
  // tracks fired ids in state.runtime.firedTriggers.
  //
  // Composite `when:` shows off how trigger conditions can mix:
  // - letter_02 requires both a raid count AND a spectral ceiling
  //   (player must be visibly *not* drowning before the inspector
  //   shows up — narrative beat, not just a counter).
  // - letter_03 chains on shogun_chapter, so the trigger order is
  //   guaranteed even if raidsCompleted accidentally jumps.
  {
    id: "letter_01_dispatch",
    once: true,
    when: { variable: { name: "raidsCompleted", min: 3 } },
    do: (ctx) => {
      queueLetterIfHub(ctx, "letter_01_suspicion");
      return {
        deltas: { variables: { shogun_chapter: 1 } },
      };
    },
  },
  {
    id: "letter_02_dispatch",
    once: true,
    when: {
      all: [
        { variable: { name: "shogun_chapter", min: 1 } },
        { variable: { name: "raidsCompleted", min: 7 } },
        { characterStat: { character: "player", name: "spectral", max: 49 } },
      ],
    },
    do: (ctx) => {
      queueLetterIfHub(ctx, "letter_02_rival");
      return {
        deltas: { variables: { shogun_chapter: 1 } },
      };
    },
  },
  {
    id: "letter_03_dispatch",
    once: true,
    when: {
      all: [
        { variable: { name: "shogun_chapter", min: 2 } },
        { variable: { name: "raidsCompleted", min: 12 } },
      ],
    },
    do: (ctx) => {
      queueLetterIfHub(ctx, "letter_03_choice");
      return {
        deltas: { variables: { shogun_chapter: 1 } },
      };
    },
  },
  // 三花の盟 — once-only trigger when all three companions have
  // survived at least one raid each. Composite of three switches via
  // the `all` connector. The reward is a special script that branches
  // the endings.
  {
    id: "three_flowers_alliance",
    once: true,
    when: {
      all: [
        { switch: { name: "befriended_kagari" } },
        { switch: { name: "befriended_kasumi" } },
        { switch: { name: "befriended_mio" } },
      ],
    },
    do: (ctx) => {
      queueLetterIfHub(ctx, "three_flowers_alliance");
      return {};
    },
  },
];

// ============================================================================
// Module declaration
// ============================================================================

const raidModule: Module = {
  id: MODULE_ID,
  version: "0.3.0",

  initialize: (_game: Game): RaidModuleState => ({
    mode: "hub",
    raid: null,
    metCharacters: [],
    companion: null,
    companionHp: 0,
  }),

  // Action handler kinds the module supplies. Engine namespaces them as
  // "sengoku-raid:<kind>"; bare form resolves uniquely since no other
  // module claims these names. HubActivities built by onHubBuild
  // reference the bare form via HubActivity.actionKind.
  provides: [
    "depart",
    "bond",
    "sell_all_loot",
    "upgrade_weapon",
    "rest",
    "use_chinkonho",
    "move",
    "search",
    "attack",
    "sneak_strike",
    "flee",
    "extract",
    "negotiate_listen",
    "negotiate_release",
    "yaodao_voice",
    "invite",
  ],
  actionHandlers: {
    depart: departHandler,
    bond: bondHandler,
    sell_all_loot: sellAllLootHandler,
    upgrade_weapon: upgradeWeaponHandler,
    rest: restHandler,
    use_chinkonho: useChinkonhoHandler,
    move: moveHandler,
    search: searchHandler,
    attack: attackHandler,
    sneak_strike: sneakStrikeHandler,
    flee: fleeHandler,
    extract: extractHandler,
    negotiate_listen: negotiateListenHandler,
    negotiate_release: negotiateReleaseHandler,
    yaodao_voice: yaodaoVoiceHandler,
    invite: inviteHandler,
  },

  onSessionStart: (ctx) => {
    // Player stats (hp/mental/spectral/intellect) are pre-populated from
    // characters/player.md's declared initials — no manual bootstrap
    // here. raidsCompleted/raidsFailed are declared variables — engine
    // pre-populates from game.yaml.
    if (ctx.state.baseline.inventory.ryo === undefined) {
      ctx.state.baseline.inventory.ryo = 100;
    }
    if (
      ctx.state.baseline.scripts["000_intro"]?.completed !== true &&
      ctx.scriptMap.has("000_intro") &&
      ctx.state.baseline.currentScriptId === null
    ) {
      ctx.state.baseline.currentScriptId = "000_intro";
      ctx.state.baseline.beatIndex = 0;
    }
  },

  triggers,

  // ============== Letter lifecycle observers ==============
  // onScriptStart fires before the first beat yields. We push a single
  // header narration ahead of the letter body so the player gets the
  // "公儀御沙汰" page-break visually, no matter how the script was queued
  // (trigger / hub / save-load).
  onScriptStart: (ctx, scriptId) => {
    if (scriptId.startsWith("letter_")) {
      ctx.state.runtime.pendingNarrations.unshift(
        `——— 公儀御沙汰 ———`,
      );
    }
  },

  // onScriptComplete is the natural place to finalize a letter's
  // module-level side effects that can't go in the script's effects
  // block: pushing mio into metCharacters (a private module state
  // slice). The chapter advance already happened in the dispatch
  // trigger, so we don't touch shogun_chapter here.
  onScriptComplete: (ctx, scriptId) => {
    if (scriptId === "letter_02_rival") {
      const m = moduleState(ctx);
      if (!m.metCharacters.includes("mio")) {
        m.metCharacters.push("mio");
      }
    }
  },

  // ============== Companion-aware reducers ==============
  //
  // onActionDispatch (first-wins): when a companion is in party at
  // critical HP, veto `attack` and `sneak_strike` dispatches. Player
  // must flee, use chinkonho, or let HP recover before re-engaging.
  // Returns "cancel" — engine still fires onActionComplete with
  // result=undefined, but the handler body doesn't run.
  onActionDispatch: (ctx, action) => {
    const m = moduleState(ctx);
    if (
      m.companion &&
      m.companionHp > 0 &&
      m.companionHp <= 3 &&
      (action.kind === "attack" || action.kind === "sneak_strike")
    ) {
      const charName =
        ctx.game.characters.find((c) => c.id === m.companion!)?.name ??
        m.companion!;
      ctx.state.runtime.pendingNarrations.push(
        `${charName}が刀を抑えた。「下がれ、深い」——その目に、お主が今日見たどの鬼より強い意志。攻撃は取り消された。`,
      );
      return "cancel";
    }
    return;
  },

  // onBeatBefore (reducer): in bond scripts, if the player's spectral
  // is already past the "危険" threshold (≥50), shadow specific dialogue
  // beats with an alternate text that acknowledges the change. Uses
  // the `{ replace: <beat> }` return form so the timeline still
  // advances one beat per drain.
  onBeatBefore: (ctx, scriptId, _beatIdx, beat) => {
    if (!scriptId.startsWith("bond_")) return;
    if (beat.type !== "dialogue") return;
    if (playerStat(ctx, "spectral") < 50) return;
    // Replace one specific tag — first dialogue beat where speaker is
    // the bond target — with a darker variant. We just append a
    // suffix to make it cheap & uniform.
    return {
      replace: {
        ...beat,
        text: `${beat.text}（——その目を、見つめ返せなかった。お主の瞳が、いつもと違うらしい。）`,
      },
    };
  },

  // onChoicePresented (reducer): in bond_*_03 scenes, when a *different*
  // companion is in party, lock the boldest option (the last one, which
  // is the +2-affection "I commit" choice). Player can still pick the
  // milder options. The lock represents "I won't say that in front of
  // her" social pressure.
  //
  // NOTE on the reducer surface: the engine's runScript resolves choices
  // by indexing back into the original `beat.options` (runScript.ts:105).
  // That means reducers can MARK options unavailable but cannot ADD new
  // ones meaningfully — extra options shown to the player don't have a
  // corresponding ChoiceOption to dispatch. So this hook is for
  // contextual locking only, matching hook-test's coverage.
  onChoicePresented: (ctx, scriptId, _beatIdx, options) => {
    if (!scriptId.match(/^bond_\w+_03$/)) return;
    const m = moduleState(ctx);
    if (!m.companion) return;
    const subjectMatch = scriptId.match(/^bond_(\w+)_03$/);
    if (!subjectMatch) return;
    const subject = subjectMatch[1];
    if (m.companion === subject) return; // self in party — no jealousy axis
    const sideName =
      ctx.game.characters.find((c) => c.id === m.companion!)?.name ??
      m.companion!;
    const lastIdx = options.length - 1;
    return options.map((opt, idx) =>
      idx === lastIdx
        ? {
            ...opt,
            available: false,
            lockedReason: `${sideName}が隣にいる。今ここで口にする言葉ではない。`,
          }
        : opt,
    );
  },

  onHubBuild: (ctx) => {
    const m = moduleState(ctx);
    return m.mode === "hub" ? buildHubMenu(ctx) : buildRaidMenu(ctx);
  },
};

export default raidModule;
