import { evaluateCondition } from "../condition";
import type {
  Beat,
  Input,
  Output,
  PresetContext,
  RenderedChoice,
  Script,
} from "../types";
import { END_LABEL } from "../types";
import { drainNarrations } from "./drainNarrations";
import {
  fireOnBeatAfter,
  fireOnBeatBefore,
  fireOnChoicePresented,
  fireOnChoiceResolved,
  fireOnLabelEnter,
  fireOnScriptStart,
} from "./hooks";
import { mutateState } from "./mutateState";

// Run a single script's beats from state.baseline.beatIndex forward.
// Yields per beat; returns true when the script reaches [end] or its
// last beat, false on a quit input.
//
// Hooks fired inside:
//   - onScriptStart (observer, once at entry)
//   - onBeatBefore (reducer, per beat; may skip or replace)
//   - onBeatAfter (observer, per beat after input)
//   - onChoicePresented (reducer, before choice yield)
//   - onChoiceResolved (observer, after choose input)
//   - onLabelEnter (observer, when goto enters a label)
// onScriptComplete fires from the caller after a true return.
export async function* runScript(
  ctx: PresetContext,
  script: Script,
): AsyncGenerator<Output, boolean, Input> {
  const labelMap = buildLabelMap(script);
  const { state } = ctx;

  fireOnScriptStart(ctx, script.id);

  // Drain any narrations the onScriptStart hooks pushed BEFORE we yield
  // the first beat. Without this, step()'s prime/input pattern can
  // re-yield beat 0: the prime of the next step would yield the queued
  // narration (discarded by step), and only the subsequent input would
  // re-enter runScript at the still-unadvanced beatIndex, yielding the
  // first beat a second time. See drainNarrations.ts for the broader
  // peek/step protocol this guards against.
  yield* drainNarrations(ctx);

  while (state.baseline.beatIndex < script.beats.length) {
    const beatIdx = state.baseline.beatIndex;
    const original = script.beats[beatIdx];
    if (!original) break;

    // Let modules pre-process / skip / replace the beat.
    const reduced = fireOnBeatBefore(ctx, script.id, beatIdx, original);
    if ("skip" in reduced) {
      state.baseline.beatIndex++;
      fireOnBeatAfter(ctx, script.id, beatIdx, original);
      continue;
    }
    const beat: Beat = reduced as Beat;

    switch (beat.type) {
      case "narration": {
        const input = yield { type: "narration", text: beat.text };
        if (input.type === "quit") return false;
        // Only `next` advances. Other input types (choose / doActivity
        // / select) sent against a narration are an input-order mistake
        // by the caller — re-yield same beat so they see what happened
        // instead of silently swallowing the input. Matches the
        // `choice` case's protocol below.
        if (input.type !== "next") continue;
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
        if (input.type !== "next") continue;
        break;
      }
      case "choice": {
        const baseRendered: RenderedChoice[] = beat.options.map((opt) => {
          const available =
            opt.requires === undefined ||
            evaluateCondition(opt.requires, state);
          return {
            text: opt.text,
            available,
            lockedReason: available ? undefined : "条件未满足",
          };
        });
        const rendered = fireOnChoicePresented(
          ctx,
          script.id,
          beatIdx,
          baseRendered,
        );
        const input = yield {
          type: "choice",
          prompt: beat.prompt,
          options: rendered,
          ...(beat.view !== undefined ? { view: beat.view } : {}),
        };
        if (input.type === "quit") return false;
        if (input.type !== "choose") continue;
        const chosen = beat.options[input.index];
        if (!chosen) continue;
        if (rendered[input.index]?.available === false) continue;
        fireOnChoiceResolved(ctx, script.id, beatIdx, input.index);
        if (chosen.effects) mutateState(ctx, chosen.effects, "choice");
        if (chosen.goto !== undefined) {
          if (chosen.goto === END_LABEL) {
            fireOnBeatAfter(ctx, script.id, beatIdx, beat);
            return true;
          }
          const target = labelMap.get(chosen.goto);
          if (target === undefined) {
            throw new Error(
              `runScript: choice goto target not found in script "${script.id}": ${chosen.goto}`,
            );
          }
          state.baseline.beatIndex = target;
          fireOnLabelEnter(ctx, script.id, chosen.goto);
          fireOnBeatAfter(ctx, script.id, beatIdx, beat);
          continue;
        }
        break;
      }
      case "effects": {
        mutateState(ctx, beat.effects, "beat");
        break;
      }
      case "label": {
        fireOnLabelEnter(ctx, script.id, beat.name);
        break;
      }
      case "endScript": {
        fireOnBeatAfter(ctx, script.id, beatIdx, beat);
        return true;
      }
      case "clear": {
        const input = yield { type: "clear" };
        if (input.type === "quit") return false;
        break;
      }
    }

    fireOnBeatAfter(ctx, script.id, beatIdx, beat);
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
