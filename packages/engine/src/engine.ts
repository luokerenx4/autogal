import { evaluateCondition } from "./condition";
import { applyDelta, cloneState, createInitialState } from "./state";
import type {
  ComposedState,
  Game,
  Input,
  Output,
  RenderedChoice,
  Script,
  ScriptInfo,
} from "./types";
import { END_LABEL } from "./types";

export class Engine {
  private state: ComposedState;
  private readonly scriptMap: Map<string, Script>;
  private readonly characterNameMap: Map<string, string>;

  constructor(
    private readonly game: Game,
    initialState?: ComposedState,
  ) {
    this.state = initialState ?? createInitialState(game);
    this.scriptMap = new Map(game.scripts.map((s) => [s.id, s]));
    this.characterNameMap = new Map(game.characters.map((c) => [c.id, c.name]));
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
      if (this.state.baseline.currentScriptId === null) {
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
      } else {
        return;
      }
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
