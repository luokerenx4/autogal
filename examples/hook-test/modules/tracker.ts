// Hook lifecycle tracker. Registers every hook on the Module
// interface, logs each fire to state["hook-tracker"].log so fixtures
// can assert on ordering / presence. Also acts as a transformer
// (skip-beat / redirect-script / cancel-action / etc.) driven by
// declared variables / switches so different fixtures can opt into
// different transformer behaviors without needing separate modules.

import type { Module, PresetContext } from "@rpg-harness/engine";

const NS = "hook-tracker";

interface TrackerSlot {
  log: string[];
}

function log(ctx: PresetContext, entry: string): void {
  const slot = ctx.state[NS] as TrackerSlot | undefined;
  if (!slot) return;
  slot.log.push(entry);
}

function getVar<T extends string | number>(
  ctx: PresetContext,
  key: string,
): T | undefined {
  const v = ctx.state.baseline.variables[key];
  return v as T | undefined;
}

function getSwitch(ctx: PresetContext, key: string): boolean {
  return ctx.state.baseline.switches[key] === true;
}

const tracker: Module = {
  id: NS,
  version: "0.1",

  initialize: (): TrackerSlot => ({ log: [] }),

  // ============ OBSERVERS ============
  onSessionStart: (ctx) => log(ctx, "onSessionStart"),
  onScriptStart: (ctx, scriptId) => log(ctx, `onScriptStart:${scriptId}`),
  onScriptComplete: (ctx, scriptId) =>
    log(ctx, `onScriptComplete:${scriptId}`),
  onBeatAfter: (ctx, scriptId, beatIdx, beat) =>
    log(ctx, `onBeatAfter:${scriptId}:${beatIdx}:${beat.type}`),
  onChoiceResolved: (ctx, scriptId, beatIdx, choiceIdx) =>
    log(ctx, `onChoiceResolved:${scriptId}:${beatIdx}:${choiceIdx}`),
  onLabelEnter: (ctx, scriptId, labelName) =>
    log(ctx, `onLabelEnter:${scriptId}:${labelName}`),
  onActionComplete: (ctx, action, _result) =>
    log(ctx, `onActionComplete:${action.id}`),
  onStateMutated: (ctx, _delta, source) =>
    log(ctx, `onStateMutated:${source}`),
  onNarrationDrain: (ctx, text) =>
    log(ctx, `onNarrationDrain:${text.slice(0, 12)}`),
  onEndConditionFire: (ctx, ec) =>
    log(ctx, `onEndConditionFire:${ec.reason}`),

  // ============ FIRST-WINS ============
  onScriptSelect: (ctx, scriptId) => {
    log(ctx, `onScriptSelect:${scriptId}`);
    const redirect = getVar<string>(ctx, "redirectScriptTo");
    return typeof redirect === "string" && redirect.length > 0
      ? redirect
      : undefined;
  },
  onHubBuild: (ctx) => {
    log(ctx, "onHubBuild");
    return undefined; // let training preset provide the hub
  },
  onActionDispatch: (ctx, action) => {
    log(ctx, `onActionDispatch:${action.id}`);
    if (getSwitch(ctx, "cancelActions")) return "cancel";
    return undefined;
  },

  // ============ REDUCERS ============
  onChoicePresented: (ctx, scriptId, beatIdx, options) => {
    log(ctx, `onChoicePresented:${scriptId}:${beatIdx}:${options.length}`);
    const filterOut = getVar<number>(ctx, "filterChoiceIdx");
    if (typeof filterOut === "number" && filterOut >= 0) {
      return options.map((o, i) =>
        i === filterOut ? { ...o, available: false, lockedReason: "filtered" } : o,
      );
    }
    return undefined;
  },
  onBeatBefore: (ctx, scriptId, beatIdx, beat) => {
    log(ctx, `onBeatBefore:${scriptId}:${beatIdx}:${beat.type}`);
    const skipAt = getVar<number>(ctx, "skipBeatIdx");
    if (typeof skipAt === "number" && skipAt === beatIdx) {
      return { skip: true };
    }
    return undefined;
  },

  // ============ REACTIVE TRIGGERS ============
  triggers: [
    // Milestone: fires the FIRST time dev's affection crosses 1.
    // `once: true` — even if dev drops back to 0 and crosses 1 again
    // later, this won't re-fire.
    {
      id: "dev-first-bond",
      when: { affection: { character: "dev", min: 1 } },
      once: true,
      do: (ctx) => {
        log(ctx, "TRIGGER:dev-first-bond");
        return {
          narrations: ["[trigger] dev 第一次对你产生信任。"],
        };
      },
    },
    // Re-arming: fires every time `marker` first crosses 5 (default
    // `once: false`). Falling back below 5 and crossing again will
    // fire it again. Useful for "warning when stat dips too low,
    // again."
    {
      id: "marker-crossed-5",
      when: { stat: { name: "marker", min: 5 } },
      do: (ctx) => {
        log(ctx, "TRIGGER:marker-crossed-5");
        return {};
      },
    },
    // Composite milestone: fires when BOTH dev.affection >= 2 AND
    // marker >= 3 become true (the AND is evaluated atomically by
    // the condition AST). once: true so this is a one-shot "secret
    // reveal" beat. Sets a flag downstream scripts/actions can gate
    // on, and pushes a thematic narration. This is the pattern that
    // pre-trigger would have needed a hidden activity for — now it
    // fires reactively.
    {
      id: "secret-revealed",
      when: {
        all: [
          { affection: { character: "dev", min: 2 } },
          { stat: { name: "marker", min: 3 } },
        ],
      },
      once: true,
      do: (ctx) => {
        log(ctx, "TRIGGER:secret-revealed");
        return {
          deltas: { switches: { secretRevealed: true } },
          narrations: [
            "[secret] dev 看了你一眼，把笔记本翻到了空白页。",
            "[secret] 那一页上画着的，是 marker 的真正含义。",
          ],
        };
      },
    },
  ],
};

export default tracker;
