import { evaluateCondition } from "../condition";
import { applyDelta } from "../state";
import type {
  Input,
  Output,
  PresetContext,
  RenderedChoice,
  Script,
} from "../types";
import { END_LABEL } from "../types";

// Run a single script's beats from state.baseline.beatIndex forward.
// Yields per beat; returns true when the script reaches [end] or its
// last beat, false on a quit input.
//
// State mutated: baseline.beatIndex (after each beat), and any deltas
// from `effects` beats / choice picks. The caller is responsible for
// pushing the completed scriptId into baseline.completedScripts and
// resetting currentScriptId on a true return.
export async function* runScript(
  ctx: PresetContext,
  script: Script,
): AsyncGenerator<Output, boolean, Input> {
  const labelMap = buildLabelMap(script);
  const { state } = ctx;
  while (state.baseline.beatIndex < script.beats.length) {
    const beat = script.beats[state.baseline.beatIndex];
    if (!beat) break;

    switch (beat.type) {
      case "narration": {
        const input = yield { type: "narration", text: beat.text };
        if (input.type === "quit") return false;
        break;
      }
      case "dialogue": {
        const speakerName =
          ctx.characterNameMap.get(beat.speaker) ?? beat.speaker;
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
            evaluateCondition(opt.requires, state);
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
        if (chosen.effects) applyDelta(state, chosen.effects);
        if (chosen.goto !== undefined) {
          if (chosen.goto === END_LABEL) return true;
          const target = labelMap.get(chosen.goto);
          if (target === undefined) {
            throw new Error(
              `runScript: choice goto target not found in script "${script.id}": ${chosen.goto}`,
            );
          }
          state.baseline.beatIndex = target;
          continue;
        }
        break;
      }
      case "effects": {
        applyDelta(state, beat.effects);
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

    state.baseline.beatIndex++;
  }
  return true;
}

function buildLabelMap(script: Script): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < script.beats.length; i++) {
    const beat = script.beats[i];
    if (beat?.type === "label") map.set(beat.name, i);
  }
  return map;
}
