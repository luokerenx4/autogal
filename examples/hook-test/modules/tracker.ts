// Hook lifecycle tracker. Registers every hook on the Module
// interface, logs each fire to state["hook-tracker"].log so fixtures
// can assert on ordering / presence. Also acts as a transformer
// (skip-beat / redirect-script / cancel-action / etc.) driven by
// state.baseline.flags so different fixtures can opt into different
// transformer behaviors without needing separate modules.

import type { Module, PresetContext } from "@autogal/engine";

const NS = "hook-tracker";

interface TrackerSlot {
  log: string[];
}

function log(ctx: PresetContext, entry: string): void {
  const slot = ctx.state[NS] as TrackerSlot | undefined;
  if (!slot) return;
  slot.log.push(entry);
}

function flag<T>(ctx: PresetContext, key: string): T | undefined {
  return ctx.state.baseline.flags[key] as T | undefined;
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
    const redirect = flag<string>(ctx, "redirectScriptTo");
    return typeof redirect === "string" ? redirect : undefined;
  },
  onHubBuild: (ctx) => {
    log(ctx, "onHubBuild");
    return undefined; // let training preset provide the hub
  },
  onActionDispatch: (ctx, action) => {
    log(ctx, `onActionDispatch:${action.id}`);
    if (flag<boolean>(ctx, "cancelActions") === true) return "cancel";
    return undefined;
  },

  // ============ REDUCERS ============
  onChoicePresented: (ctx, scriptId, beatIdx, options) => {
    log(ctx, `onChoicePresented:${scriptId}:${beatIdx}:${options.length}`);
    const filterOut = flag<number>(ctx, "filterChoiceIdx");
    if (typeof filterOut === "number") {
      return options.map((o, i) =>
        i === filterOut ? { ...o, available: false, lockedReason: "filtered" } : o,
      );
    }
    return undefined;
  },
  onBeatBefore: (ctx, scriptId, beatIdx, beat) => {
    log(ctx, `onBeatBefore:${scriptId}:${beatIdx}:${beat.type}`);
    const skipAt = flag<number>(ctx, "skipBeatIdx");
    if (typeof skipAt === "number" && skipAt === beatIdx) {
      return { skip: true };
    }
    return undefined;
  },
};

export default tracker;
