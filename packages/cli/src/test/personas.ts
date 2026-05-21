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
};
