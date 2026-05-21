import { evaluateCondition } from "./condition";
import { cloneState, createInitialState, resolveModules } from "./state";
import {
  checkEndConditions,
  dispatchActivity,
  drainNarrations,
  fireOnActionComplete,
  fireOnEndConditionFire,
  fireOnHubBuild,
  fireOnScriptComplete,
  fireOnScriptSelect,
  fireOnSessionStart,
  runScript,
} from "./primitives";
import type {
  Action,
  ActionHandler,
  ComposedState,
  Game,
  Input,
  Output,
  PresetContext,
  ScriptInfo,
} from "./types";

export class Engine {
  private state: ComposedState;
  private readonly ctx: PresetContext;

  constructor(
    private readonly game: Game,
    initialState?: ComposedState,
  ) {
    this.state = initialState ?? createInitialState(game);
    const scriptMap = new Map(game.scripts.map((s) => [s.id, s]));
    const actionMap = new Map((game.actions ?? []).map((a) => [a.id, a]));
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

    this.ctx = {
      state: this.state,
      game,
      modules,
      actionHandlerRegistry,
      scriptMap,
      actionMap,
      characterNameMap,
      rng: Math.random,
    };
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

  // Main loop. Inline for now — C3 will move this body into per-preset
  // run.ts files. Each block delegates to a primitive that operates on
  // this.ctx.
  async *run(): AsyncGenerator<Output, void, Input> {
    fireOnSessionStart(this.ctx);

    while (true) {
      // 1. Drain any queued narrations (e.g. from a combat that ran
      //    atomically last step).
      yield* drainNarrations(this.ctx);

      // 2. End conditions check (only when no script mid-flight).
      if (this.state.baseline.currentScriptId === null) {
        const endCheck = checkEndConditions(this.ctx);
        if (endCheck) {
          fireOnEndConditionFire(this.ctx, endCheck);
          if (
            endCheck.goto &&
            !this.state.baseline.completedScripts.includes(endCheck.goto) &&
            this.ctx.scriptMap.has(endCheck.goto)
          ) {
            this.state.baseline.currentScriptId = endCheck.goto;
            this.state.baseline.beatIndex = 0;
            continue;
          }
          yield { type: "gameEnd", reason: endCheck.reason };
          return;
        }
      }

      // 3. Run the current script if one is set.
      if (this.state.baseline.currentScriptId !== null) {
        const script = this.ctx.scriptMap.get(
          this.state.baseline.currentScriptId,
        );
        if (!script) {
          throw new Error(
            `Engine: current script not found: ${this.state.baseline.currentScriptId}`,
          );
        }
        const finished = yield* runScript(this.ctx, script);
        if (finished) {
          const completedId = script.id;
          this.state.baseline.completedScripts.push(completedId);
          this.state.baseline.currentScriptId = null;
          this.state.baseline.beatIndex = 0;
          fireOnScriptComplete(this.ctx, completedId);
          // Scripts count as 1 slot when a preset is providing the hub
          // (i.e. training mode). The preset's onActionComplete hook
          // owns calendar bookkeeping.
          const completedAction: Action = {
            id: completedId,
            title: script.title,
            cost: 1,
          };
          fireOnActionComplete(this.ctx, completedAction, undefined);
        } else {
          return;
        }
        continue;
      }

      // 4. Hub vs scriptComplete: ask each module if it provides a hub
      //    Output for the current state. First non-undefined wins
      //    (typically the training preset). Pure-VN games fall through.
      const hubOutput = fireOnHubBuild(this.ctx);
      if (hubOutput !== undefined) {
        const input = yield hubOutput;
        if (input.type === "quit") return;
        if (input.type !== "doActivity") continue;
        const dispatched = yield* dispatchActivity(this.ctx, input.id);
        if (dispatched === "quit") return;
      } else {
        const available = this.getAvailableScripts();
        if (available.length === 0) {
          yield { type: "gameEnd" };
          return;
        }
        const completedId =
          this.state.baseline.completedScripts[
            this.state.baseline.completedScripts.length - 1
          ] ?? null;
        const input = yield {
          type: "scriptComplete",
          completedId,
          nextAvailable: available,
        };
        if (input.type === "quit") return;
        if (input.type !== "select") continue;
        const finalId = fireOnScriptSelect(this.ctx, input.scriptId);
        if (!this.ctx.scriptMap.has(finalId)) continue;
        this.state.baseline.currentScriptId = finalId;
        this.state.baseline.beatIndex = 0;
      }
    }
  }
}
