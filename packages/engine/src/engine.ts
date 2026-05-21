import { evaluateCondition } from "./condition";
import {
  applyDelta,
  cloneState,
  createInitialState,
  resolveModules,
} from "./state";
import type {
  Action,
  ActionHandler,
  ActionResult,
  ComposedState,
  EndConditionSpec,
  Game,
  Input,
  Module,
  Output,
  RenderedChoice,
  Script,
  ScriptInfo,
} from "./types";
import { END_LABEL } from "./types";

export class Engine {
  private state: ComposedState;
  private readonly scriptMap: Map<string, Script>;
  private readonly actionMap: Map<string, Action>;
  private readonly characterNameMap: Map<string, string>;
  // Registry of action.kind → handler, aggregated from all modules
  // (built-in + game-provided). Duplicate kind across modules throws
  // at construction time.
  private readonly actionHandlerRegistry: Record<string, ActionHandler>;
  // Resolved module list (defaults + training preset if game.training
  // present + game-provided modules). Used for hub/lifecycle dispatch.
  private readonly modules: Module[];

  constructor(
    private readonly game: Game,
    initialState?: ComposedState,
  ) {
    this.state = initialState ?? createInitialState(game);
    this.scriptMap = new Map(game.scripts.map((s) => [s.id, s]));
    this.actionMap = new Map((game.actions ?? []).map((a) => [a.id, a]));
    this.characterNameMap = new Map(game.characters.map((c) => [c.id, c.name]));
    this.modules = resolveModules(game);
    this.actionHandlerRegistry = {};
    for (const mod of this.modules) {
      for (const [kind, handler] of Object.entries(mod.actionHandlers ?? {})) {
        if (this.actionHandlerRegistry[kind]) {
          throw new Error(
            `Engine: duplicate action handler for kind "${kind}" (module ${mod.id})`,
          );
        }
        this.actionHandlerRegistry[kind] = handler;
      }
    }
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
          (s.requires === undefined ||
            evaluateCondition(s.requires, this.state)),
      )
      .map((s) => ({ id: s.id, title: s.title }));
  }

  async *run(): AsyncGenerator<Output, void, Input> {
    while (true) {
      // Drain any queued narrations (e.g. from a combat that ran atomically
      // last step). State persists across step() calls, so this resumes
      // correctly when the engine is rebuilt from disk between yields.
      const t = this.state.training;
      if (t?.pendingNarrations && t.pendingNarrations.length > 0) {
        const text = t.pendingNarrations[0]!;
        const input = yield { type: "narration", text };
        if (input.type === "quit") return;
        t.pendingNarrations.shift();
        continue;
      }

      // Only check end conditions when no script is mid-flight. Setting
      // currentScriptId + beatIndex here used to clobber an in-progress
      // ending script every loop iteration; in step mode (fresh engine per
      // call, no in-memory continuation) that meant the ending narration
      // got stuck on beat 1 forever. Now we queue the ending via the normal
      // currentScriptId path and let the existing resumption logic drive it.
      if (this.state.baseline.currentScriptId === null) {
        const endCheck = this.checkEndConditions();
        if (endCheck) {
          if (
            endCheck.goto &&
            !this.state.baseline.completedScripts.includes(endCheck.goto) &&
            this.scriptMap.has(endCheck.goto)
          ) {
            this.state.baseline.currentScriptId = endCheck.goto;
            this.state.baseline.beatIndex = 0;
            continue;
          }
          yield { type: "gameEnd", reason: endCheck.reason };
          return;
        }
      }

      if (this.state.baseline.currentScriptId !== null) {
        const script = this.scriptMap.get(this.state.baseline.currentScriptId);
        if (!script) {
          throw new Error(
            `Engine: current script not found: ${this.state.baseline.currentScriptId}`,
          );
        }
        const finished = yield* this.runScript(script);
        if (finished) {
          this.state.baseline.completedScripts.push(script.id);
          this.state.baseline.currentScriptId = null;
          this.state.baseline.beatIndex = 0;
          // Scripts count as 1 slot when a preset is providing the hub
          // (i.e. training mode). The preset's advanceAfterAction owns
          // calendar bookkeeping.
          for (const mod of this.modules) {
            mod.advanceAfterAction?.(this.state, this.game, {
              id: script.id,
              title: script.title,
              cost: 1,
            });
          }
        } else {
          return;
        }
        continue;
      }

      // Hub vs scriptComplete: ask each module if it provides a hub
      // Output for the current state. First non-null wins (typically
      // the training preset, when game.training is configured). Pure-VN
      // games have no hub-providing module → fall through to scriptComplete.
      const hubOutput = this.askModulesForHub();
      if (hubOutput) {
        const input = yield hubOutput;
        if (input.type === "quit") return;
        if (input.type !== "doActivity") continue;
        const dispatched = yield* this.dispatchActivity(input.id);
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
        if (!this.scriptMap.has(input.scriptId)) continue;
        this.state.baseline.currentScriptId = input.scriptId;
        this.state.baseline.beatIndex = 0;
      }
    }
  }

  private askModulesForHub(): Output | null {
    for (const mod of this.modules) {
      const out = mod.buildHubOutput?.(this.state, this.game);
      if (out) return out;
    }
    return null;
  }

  private checkEndConditions(): EndConditionSpec | null {
    if (!this.game.training) return null;
    for (const ec of this.game.training.endConditions) {
      if (evaluateCondition(ec.when, this.state)) {
        return ec;
      }
    }
    return null;
  }

  private async *dispatchActivity(
    activityId: string,
  ): AsyncGenerator<Output, "ok" | "quit", Input> {
    if (activityId.startsWith("script:")) {
      const scriptId = activityId.slice("script:".length);
      if (!this.scriptMap.has(scriptId)) return "ok";
      if (this.state.baseline.completedScripts.includes(scriptId)) return "ok";
      this.state.baseline.currentScriptId = scriptId;
      this.state.baseline.beatIndex = 0;
      return "ok";
    }
    if (activityId.startsWith("action:")) {
      const actionId = activityId.slice("action:".length);
      const action = this.actionMap.get(actionId);
      if (!action) return "ok";
      const available =
        action.requires === undefined ||
        evaluateCondition(action.requires, this.state);
      if (!available) return "ok";
      const result = yield* this.runAction(action);
      return result;
    }
    return "ok";
  }

  private async *runAction(
    action: Action,
  ): AsyncGenerator<Output, "ok" | "quit", Input> {
    const handler = action.kind ? this.actionHandlerRegistry[action.kind] : undefined;
    if (handler) {
      this.applyActionResult(handler({
        state: this.state,
        action,
        game: this.game,
        rng: Math.random,
      }));
    } else if (action.effects) {
      applyDelta(this.state, action.effects);
    }
    // Notify every module that an action completed. The training preset
    // uses this hook to advance slot/day and apply per-day decay; other
    // modules can observe state transitions here. Engine itself is
    // calendar-agnostic.
    for (const mod of this.modules) {
      mod.advanceAfterAction?.(this.state, this.game, action);
    }
    return "ok";
  }

  // Apply the atomic result of a module-provided ActionHandler:
  //   - merge state deltas via applyDelta
  //   - enqueue narrations for the run() loop to drain one per step
  //   - append customLog entries to state[moduleId].log[]
  private applyActionResult(result: ActionResult): void {
    if (result.deltas) applyDelta(this.state, result.deltas);
    if (result.narrations && result.narrations.length > 0) {
      const t = this.state.training;
      if (t) {
        if (!t.pendingNarrations) t.pendingNarrations = [];
        t.pendingNarrations.push(...result.narrations);
      }
    }
    if (result.customLog) {
      const { moduleId, entry } = result.customLog;
      const existing = this.state[moduleId] as
        | { log?: unknown[] }
        | undefined;
      const slot = existing ?? { log: [] };
      if (!Array.isArray(slot.log)) slot.log = [];
      slot.log.push(entry);
      this.state[moduleId] = slot;
    }
  }


  private async *runScript(
    script: Script,
  ): AsyncGenerator<Output, boolean, Input> {
    const labelMap = buildLabelMap(script);
    while (this.state.baseline.beatIndex < script.beats.length) {
      const beat = script.beats[this.state.baseline.beatIndex];
      if (!beat) break;

      switch (beat.type) {
        case "narration": {
          const input = yield { type: "narration", text: beat.text };
          if (input.type === "quit") return false;
          break;
        }
        case "dialogue": {
          const speakerName =
            this.characterNameMap.get(beat.speaker) ?? beat.speaker;
          const input = yield {
            type: "dialogue",
            speakerId: beat.speaker,
            speakerName,
            text: beat.text,
          };
          if (input.type === "quit") return false;
          break;
        }
        case "choice": {
          const rendered: RenderedChoice[] = beat.options.map((opt) => {
            const available =
              opt.requires === undefined ||
              evaluateCondition(opt.requires, this.state);
            return {
              text: opt.text,
              available,
              lockedReason: available ? undefined : "条件未满足",
            };
          });
          const input = yield {
            type: "choice",
            prompt: beat.prompt,
            options: rendered,
          };
          if (input.type === "quit") return false;
          if (input.type !== "choose") continue;
          const chosen = beat.options[input.index];
          if (!chosen) continue;
          if (rendered[input.index]?.available === false) continue;
          if (chosen.effects) applyDelta(this.state, chosen.effects);
          if (chosen.goto !== undefined) {
            if (chosen.goto === END_LABEL) {
              return true;
            }
            const target = labelMap.get(chosen.goto);
            if (target === undefined) {
              throw new Error(
                `Engine: choice goto target not found in script "${script.id}": ${chosen.goto}`,
              );
            }
            this.state.baseline.beatIndex = target;
            continue;
          }
          break;
        }
        case "effects": {
          applyDelta(this.state, beat.effects);
          break;
        }
        case "label": {
          break;
        }
        case "endScript": {
          return true;
        }
        case "clear": {
          const input = yield { type: "clear" };
          if (input.type === "quit") return false;
          break;
        }
      }

      this.state.baseline.beatIndex++;
    }
    return true;
  }
}

function buildLabelMap(script: Script): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < script.beats.length; i++) {
    const beat = script.beats[i];
    if (beat?.type === "label") {
      map.set(beat.name, i);
    }
  }
  return map;
}

