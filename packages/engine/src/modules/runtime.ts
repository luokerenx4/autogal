import type { Game, Module, RuntimeState } from "../types";

export const RUNTIME_NAMESPACE = "runtime";

// Initial transient run-loop state. Holds the cross-step narration
// queue (drained one per step() by every preset's main loop).
export function createRuntimeState(): RuntimeState {
  return {
    pendingNarrations: [],
  };
}

export const runtimeModule: Module = {
  id: RUNTIME_NAMESPACE,
  version: "0.1",
  initialize(_game: Game): RuntimeState {
    return createRuntimeState();
  },
};
