import type { ComposedState, Input, Output } from "@autogal/engine";

export type Persona = (
  output: Output,
  state: ComposedState,
  step: number,
) => Promise<Input | null>;

function pickFirstAvailableChoice(output: Output): Input | null {
  if (output.type !== "choice") return null;
  const i = output.options.findIndex((o) => o.available);
  return i >= 0 ? { type: "choose", index: i } : { type: "quit" };
}

function pickLastAvailableChoice(output: Output): Input | null {
  if (output.type !== "choice") return null;
  const found = [...output.options]
    .map((o, i) => ({ o, i }))
    .reverse()
    .find(({ o }) => o.available);
  return found ? { type: "choose", index: found.i } : { type: "quit" };
}

function pickActivity(
  output: Output,
  picker: (available: { id: string; idx: number }[]) => number,
): Input | null {
  if (output.type !== "hubMenu") return null;
  const acts = output.snapshot.activities
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => a.available)
    .map(({ a, idx }) => ({ id: a.id, idx }));
  if (acts.length === 0) return { type: "quit" };
  const pickIdx = picker(acts);
  const chosen = output.snapshot.activities[pickIdx];
  if (!chosen) return { type: "quit" };
  return { type: "doActivity", id: chosen.id };
}

export const personas: Record<string, Persona> = {
  greedy: async (output) => {
    if (output.type === "choice") return pickFirstAvailableChoice(output);
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      return first ? { type: "select", scriptId: first.id } : null;
    }
    if (output.type === "hubMenu") {
      return pickActivity(output, (acts) => acts[0]!.idx);
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  charmer: async (output) => {
    if (output.type === "choice") return pickLastAvailableChoice(output);
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      return first ? { type: "select", scriptId: first.id } : null;
    }
    if (output.type === "hubMenu") {
      return pickActivity(output, (acts) => acts[acts.length - 1]!.idx);
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  rude: async (output) => {
    if (output.type === "choice") {
      const second = output.options[1];
      if (second?.available) return { type: "choose", index: 1 };
      return pickFirstAvailableChoice(output);
    }
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      return first ? { type: "select", scriptId: first.id } : null;
    }
    if (output.type === "hubMenu") {
      return pickActivity(output, (acts) => {
        if (acts.length >= 2) return acts[1]!.idx;
        return acts[0]!.idx;
      });
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  random: async (output) => {
    if (output.type === "choice") {
      const available = output.options
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => o.available);
      if (available.length === 0) return { type: "quit" };
      const pick = available[Math.floor(Math.random() * available.length)]!;
      return { type: "choose", index: pick.i };
    }
    if (output.type === "scriptComplete") {
      if (output.nextAvailable.length === 0) return null;
      const pick =
        output.nextAvailable[
          Math.floor(Math.random() * output.nextAvailable.length)
        ]!;
      return { type: "select", scriptId: pick.id };
    }
    if (output.type === "hubMenu") {
      return pickActivity(output, (acts) => {
        return acts[Math.floor(Math.random() * acts.length)]!.idx;
      });
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  // sengoku-raid: cautious extraction-shooter player. In raid mode:
  // extract whenever possible (cash in what you have), flee from any
  // encounter rather than fight. In hub mode: sell loot, rest, upgrade
  // when affordable, then redeploy. Will never engage a fight.
  extractor: async (output) => {
    if (output.type === "hubMenu") {
      const acts = output.snapshot.activities.filter((a) => a.available);
      const find = (pred: (id: string) => boolean) =>
        acts.find((a) => pred(a.id));
      // Raid-side priorities
      const ext = find((id) => id === "raid:extract");
      if (ext) return { type: "doActivity", id: ext.id };
      const flee = find((id) => id === "raid:flee");
      if (flee) return { type: "doActivity", id: flee.id };
      const search = find((id) => id === "raid:search");
      if (search) return { type: "doActivity", id: search.id };
      const move = acts.find((a) => a.id.startsWith("raid:move:"));
      if (move) return { type: "doActivity", id: move.id };
      // Hub-side priorities
      const sell = find((id) => id === "hub:sell_all_loot");
      if (sell) return { type: "doActivity", id: sell.id };
      const upgrade = find((id) => id === "hub:upgrade_weapon");
      if (upgrade) return { type: "doActivity", id: upgrade.id };
      const rest = find((id) => id === "hub:rest");
      if (rest) return { type: "doActivity", id: rest.id };
      const depart = acts.find((a) => a.id.startsWith("hub:depart:"));
      if (depart) return { type: "doActivity", id: depart.id };
      const first = acts[0];
      return first ? { type: "doActivity", id: first.id } : { type: "quit" };
    }
    if (output.type === "choice") return pickFirstAvailableChoice(output);
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      return first ? { type: "select", scriptId: first.id } : null;
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  // sengoku-raid: aggressive opposite of extractor. Always fights,
  // pushes into unvisited zones, only extracts when fully explored.
  // Useful for proving combat / death / boss paths are reachable.
  // Knows about module state (state["sengoku-raid"].raid.zones) to
  // make smart movement choices — without that, the persona oscillates
  // between visited zones forever.
  delver: async (output, state) => {
    if (output.type === "hubMenu") {
      const acts = output.snapshot.activities.filter((a) => a.available);
      const find = (pred: (id: string) => boolean) =>
        acts.find((a) => pred(a.id));
      // 1. Always fight when there's something to fight
      const atk = find((id) => id === "raid:attack");
      if (atk) return { type: "doActivity", id: atk.id };
      const sneak = find((id) => id === "raid:sneak_strike");
      if (sneak) return { type: "doActivity", id: sneak.id };
      // 2. Grab loot at current zone
      const search = find((id) => id === "raid:search");
      if (search) return { type: "doActivity", id: search.id };
      // 3. Prefer moving to an UNVISITED zone (read module state to know).
      const raid = (state as Record<string, unknown>)["sengoku-raid"] as
        | { raid?: { zones?: Record<string, { visited?: boolean }> } }
        | undefined;
      const zones = raid?.raid?.zones;
      const moveActs = acts.filter((a) => a.id.startsWith("raid:move:"));
      if (moveActs.length > 0 && zones) {
        const toUnvisited = moveActs.find((a) => {
          const target = a.id.slice("raid:move:".length);
          return zones[target] && !zones[target]!.visited;
        });
        if (toUnvisited) return { type: "doActivity", id: toUnvisited.id };
      }
      // 4. Extract ONLY if every zone in the map has been visited.
      //    Otherwise delver would extract at the first extract zone it
      //    reaches (e.g. burnt_temple on mt_houkyou) and never see the
      //    boss zone (caldera) hiding behind another branch.
      const allVisited =
        zones !== undefined &&
        Object.values(zones).every((z) => z?.visited === true);
      const extract = find((id) => id === "raid:extract");
      if (allVisited && extract) return { type: "doActivity", id: extract.id };
      // 5. Some zones still unvisited but no unvisited neighbor — take
      //    the first move; eventually BFS-like wander finds the path.
      if (moveActs.length > 0) return { type: "doActivity", id: moveActs[0]!.id };
      // 6. Cornered: extract (if we can) or quit.
      if (extract) return { type: "doActivity", id: extract.id };
      // 6. Hub-side: rest if hurt, then depart on hardest map
      const rest = find((id) => id === "hub:rest");
      if (rest) return { type: "doActivity", id: rest.id };
      const departs = acts.filter((a) => a.id.startsWith("hub:depart:"));
      if (departs.length > 0) {
        return { type: "doActivity", id: departs[departs.length - 1]!.id };
      }
      const first = acts[0];
      return first ? { type: "doActivity", id: first.id } : { type: "quit" };
    }
    if (output.type === "choice") return pickFirstAvailableChoice(output);
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      return first ? { type: "select", scriptId: first.id } : null;
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  hunter: async (output) => {
    if (output.type === "hubMenu") {
      const activities = output.snapshot.activities;
      const hunt = activities.findIndex(
        (a) => a.id === "action:hunt" && a.available,
      );
      if (hunt >= 0) return { type: "doActivity", id: activities[hunt]!.id };
      const sleep = activities.findIndex(
        (a) => a.id === "action:sleep" && a.available,
      );
      if (sleep >= 0) return { type: "doActivity", id: activities[sleep]!.id };
      const shrine = activities.findIndex(
        (a) => a.id === "action:shrine_pray" && a.available,
      );
      if (shrine >= 0) return { type: "doActivity", id: activities[shrine]!.id };
      const firstAvail = activities.findIndex((a) => a.available);
      if (firstAvail >= 0)
        return { type: "doActivity", id: activities[firstAvail]!.id };
      return { type: "quit" };
    }
    if (output.type === "choice") return pickFirstAvailableChoice(output);
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      return first ? { type: "select", scriptId: first.id } : null;
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },
};

export const personaDescriptions: Record<string, string> = {
  greedy: "总选第一个可选项 — 平均下来是温柔系玩家",
  charmer: "总选最后一个可选项 — 倾向更主动的回答",
  rude: "总选第二个 — 偏向冷漠/拒绝路线",
  random: "随机选 — 用来 stress-test 路径",
  hunter: "训练模式专用：优先讨伐妖怪，没怪打就睡，平衡灵体化",
  extractor: "extraction-shooter 专用：能撤就撤，能逃就逃，从不打硬仗",
  delver: "extraction-shooter 专用：永远进攻，永远往深处推，从不回避",
};
