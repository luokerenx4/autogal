import type { ComposedState, Input, Output } from "@autogal/engine";

export type Persona = (
  output: Output,
  state: ComposedState,
  step: number,
) => Promise<Input | null>;

export const personas: Record<string, Persona> = {
  greedy: async (output) => {
    if (output.type === "choice") {
      const i = output.options.findIndex((o) => o.available);
      return i >= 0 ? { type: "choose", index: i } : { type: "quit" };
    }
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      if (!first) return null;
      return { type: "select", scriptId: first.id };
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  charmer: async (output) => {
    if (output.type === "choice") {
      const lastAvailable = [...output.options]
        .map((o, i) => ({ o, i }))
        .reverse()
        .find(({ o }) => o.available);
      return lastAvailable
        ? { type: "choose", index: lastAvailable.i }
        : { type: "quit" };
    }
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      if (!first) return null;
      return { type: "select", scriptId: first.id };
    }
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },

  rude: async (output) => {
    if (output.type === "choice") {
      const second = output.options[1];
      if (second?.available) return { type: "choose", index: 1 };
      const i = output.options.findIndex((o) => o.available);
      return i >= 0 ? { type: "choose", index: i } : { type: "quit" };
    }
    if (output.type === "scriptComplete") {
      const first = output.nextAvailable[0];
      if (!first) return null;
      return { type: "select", scriptId: first.id };
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
    if (output.type === "gameEnd") return null;
    return { type: "next" };
  },
};

export const personaDescriptions: Record<string, string> = {
  greedy: "总选第一个可选项 — 平均下来是温柔系玩家",
  charmer: "总选最后一个可选项 — 倾向更主动的回答",
  rude: "总选第二个 — 偏向冷漠/拒绝路线",
  random: "随机选 — 用来 stress-test 路径",
};
