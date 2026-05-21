// Engine: state holder + ctx builder. The main run loop USED to live
// here (PR #1 / PR #2), but after C3 it lives in each preset's run.ts
// (presets/vn/run.ts, presets/training/run.ts, or a game-ejected
// preset/run.ts). Engine.run() now just resolves which preset to use
// and delegates.
//
// What still lives here:
//   - state initialization (via createInitialState in state.ts)
//   - PresetContext construction (script/action/character maps,
//     action handler registry from all modules' actionHandlers)
//   - getState / serialize / getAvailableScripts for callers (CLI
//     play screen uses these for session persistence)

import { evaluateCondition } from "./condition";
import { cloneState, createInitialState, resolveModules, resolveRunFn } from "./state";
import type {
  ActionHandler,
  ComposedState,
  Game,
  Input,
  Output,
  PresetContext,
  RunFunction,
  ScriptInfo,
  Trigger,
} from "./types";

export class Engine {
  private state: ComposedState;
  private readonly ctx: PresetContext;
  private readonly runFn: RunFunction;

  constructor(
    private readonly game: Game,
    initialState?: ComposedState,
  ) {
    this.state = initialState ?? createInitialState(game);
    const scriptMap = new Map(game.scripts.map((s) => [s.id, s]));
    const actionMap = new Map((game.actions ?? []).map((a) => [a.id, a]));
    const itemMap = new Map((game.items ?? []).map((i) => [i.id, i]));
    const characterNameMap = new Map(
      game.characters.map((c) => [c.id, c.name]),
    );
    const modules = resolveModules(game);

    const actionHandlerRegistry: Record<string, ActionHandler> = {};
    for (const mod of modules) {
      for (const [kind, handler] of Object.entries(mod.actionHandlers ?? {})) {
        if (actionHandlerRegistry[kind]) {
          throw new Error(
            `Engine: duplicate action handler for kind "${kind}" (module ${mod.id})`,
          );
        }
        actionHandlerRegistry[kind] = handler;
      }
    }

    const triggerRegistry: Trigger[] = [];
    const seenTriggerIds = new Set<string>();
    for (const mod of modules) {
      for (const trig of mod.triggers ?? []) {
        if (seenTriggerIds.has(trig.id)) {
          throw new Error(
            `Engine: duplicate trigger id "${trig.id}" (module ${mod.id})`,
          );
        }
        seenTriggerIds.add(trig.id);
        triggerRegistry.push(trig);
      }
    }

    this.ctx = {
      state: this.state,
      game,
      modules,
      actionHandlerRegistry,
      triggerRegistry,
      scriptMap,
      actionMap,
      itemMap,
      characterNameMap,
      rng: Math.random,
    };

    this.runFn = resolveRunFn(game);
  }

  getState(): ComposedState {
    return cloneState(this.state);
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  getAvailableScripts(): ScriptInfo[] {
    return this.game.scripts
      .filter(
        (s) =>
          !this.state.baseline.completedScripts.includes(s.id) &&
          (s.requires === undefined || evaluateCondition(s.requires, this.state)),
      )
      .map((s) => ({ id: s.id, title: s.title }));
  }

  // Delegate to the preset's run function. To customize the main loop
  // for a specific game, eject the preset and edit its run.ts directly
  // (see autogal init --eject).
  async *run(): AsyncGenerator<Output, void, Input> {
    yield* this.runFn(this.ctx);
  }
}
