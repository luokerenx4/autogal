import type { Game, Module, RuntimeState } from "../types";

export const RUNTIME_NAMESPACE = "runtime";

// Initial transient run-loop state. Holds the cross-step narration
// queue + the reactive-trigger bookkeeping (active edge tracking +
// once-fired set).
export function createRuntimeState(): RuntimeState {
  return {
    pendingNarrations: [],
    activeTriggers: [],
    firedTriggers: [],
    firedScriptStarts: [],
    lastHubActivities: [],
  };
}

export const runtimeModule: Module = {
  id: RUNTIME_NAMESPACE,
  version: "0.1",
  initialize(_game: Game): RuntimeState {
    return createRuntimeState();
  },
};
