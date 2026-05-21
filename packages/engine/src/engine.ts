import { evaluateCondition } from "./condition";
import { cloneState, createInitialState, resolveModules } from "./state";
import {
  checkEndConditions,
  dispatchActivity,
  drainNarrations,
  runScript,
} from "./primitives";
import type {
  Action,
  ActionHandler,
  ComposedState,
  Game,
  Input,
  Module,
  Output,
  PresetContext,
  Script,
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

  // Main loop. Still inline for now (C1 only extracts primitives; C3
  // moves this body into per-preset run.ts files). Each block delegates
  // to a primitive that operates on this.ctx.
  async *run(): AsyncGenerator<Output, void, Input> {
    while (true) {
      // 1. Drain any queued narrations (e.g. from a combat that ran
      //    atomically last step). State persists across step() calls,
      //    so this resumes correctly even when the engine is rebuilt
      //    from disk between yields.
      yield* drainNarrations(this.ctx);

      // 2. Only check end conditions when no script is mid-flight.
      //    Setting currentScriptId + beatIndex here used to clobber an
      //    in-progress ending script every loop iteration; in step mode
      //    (fresh engine per call, no in-memory continuation) that
      //    meant the ending narration got stuck on beat 1 forever. Now
      //    we queue the ending via the normal currentScriptId path and
      //    let the existing resumption logic drive it.
      if (this.state.baseline.currentScriptId === null) {
        const endCheck = checkEndConditions(this.ctx);
        if (endCheck) {
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
          this.state.baseline.completedScripts.push(script.id);
          this.state.baseline.currentScriptId = null;
          this.state.baseline.beatIndex = 0;
          // Scripts count as 1 slot when a preset is providing the hub
          // (i.e. training mode). The preset's advanceAfterAction owns
          // calendar bookkeeping.
          const completedAction: Action = {
            id: script.id,
            title: script.title,
            cost: 1,
          };
          for (const mod of this.ctx.modules) {
            mod.advanceAfterAction?.(this.state, this.game, completedAction);
          }
        } else {
          return;
        }
        continue;
      }

      // 4. Hub vs scriptComplete: ask each module if it provides a hub
      //    Output for the current state. First non-null wins (typically
      //    the training preset, when game.training is configured).
      //    Pure-VN games have no hub-providing module → fall through to
      //    scriptComplete.
      const hubOutput = this.askModulesForHub();
      if (hubOutput) {
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
        if (!this.ctx.scriptMap.has(input.scriptId)) continue;
        this.state.baseline.currentScriptId = input.scriptId;
        this.state.baseline.beatIndex = 0;
      }
    }
  }

  private askModulesForHub(): Output | null {
    for (const mod of this.ctx.modules) {
      const out = mod.buildHubOutput?.(this.state, this.game);
      if (out) return out;
    }
    return null;
  }
}
