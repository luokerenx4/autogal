// Screen model: projects the engine's `Output` event stream into a stable
// "screen state". The current scene (stage) is always exactly one thing —
// what the player is looking at right now. Past narrations/dialogues
// accumulate in a separate `backlog` (capped) for the `b`-toggled review
// overlay, not for inline rendering.
//
// This file is a pure reducer. PlayScreen wires Output → applyOutput;
// the model is the single source of truth for every visible region.

import type {
  HubSnapshot,
  Output,
  RenderedChoice,
  ScriptInfo,
} from "@autogal/engine";

export type Stage =
  | { kind: "loading" }
  | { kind: "error"; message: string; stack?: string }
  | { kind: "narration"; text: string }
  | { kind: "dialogue"; speakerId: string; speakerName: string; text: string }
  | { kind: "choice"; prompt?: string; options: RenderedChoice[] }
  | { kind: "hubMenu"; snapshot: HubSnapshot }
  | {
      kind: "scriptComplete";
      completedId: string | null;
      nextAvailable: ScriptInfo[];
    }
  | { kind: "ended"; reason?: string };

export type BacklogEntry =
  | { kind: "narration"; text: string }
  | { kind: "dialogue"; speakerName: string; text: string }
  | { kind: "sceneBreak" };

export interface ScreenModel {
  stage: Stage;
  backlog: BacklogEntry[];
}

export const BACKLOG_CAP = 200;

export const initialModel: ScreenModel = {
  stage: { kind: "loading" },
  backlog: [],
};

export function makeErrorModel(err: Error): ScreenModel {
  return {
    stage: { kind: "error", message: err.message, stack: err.stack },
    backlog: [],
  };
}

// Apply one engine Output to the model. Transient beats (narration /
// dialogue) demote the *previous* stage into the backlog before being
// installed. `clear` is a transcript boundary — it doesn't change the
// stage, but inserts a sceneBreak marker into the backlog. Menu-like
// outputs (choice / hubMenu / scriptComplete / gameEnd) replace the
// stage outright and don't write to backlog.
export function applyOutput(model: ScreenModel, output: Output): ScreenModel {
  switch (output.type) {
    case "narration":
      return {
        stage: { kind: "narration", text: output.text },
        backlog: demote(model.stage, model.backlog),
      };
    case "dialogue":
      return {
        stage: {
          kind: "dialogue",
          speakerId: output.speakerId,
          speakerName: output.speakerName,
          text: output.text,
        },
        backlog: demote(model.stage, model.backlog),
      };
    case "choice":
      return {
        stage: {
          kind: "choice",
          ...(output.prompt !== undefined ? { prompt: output.prompt } : {}),
          options: output.options,
        },
        backlog: demote(model.stage, model.backlog),
      };
    case "hubMenu":
      return {
        stage: { kind: "hubMenu", snapshot: output.snapshot },
        backlog: demote(model.stage, model.backlog),
      };
    case "scriptComplete":
      return {
        stage: {
          kind: "scriptComplete",
          completedId: output.completedId,
          nextAvailable: output.nextAvailable,
        },
        backlog: demote(model.stage, model.backlog),
      };
    case "gameEnd":
      return {
        stage: {
          kind: "ended",
          ...(output.reason !== undefined ? { reason: output.reason } : {}),
        },
        backlog: demote(model.stage, model.backlog),
      };
    case "clear":
      return {
        stage: model.stage,
        backlog: capBacklog([...model.backlog, { kind: "sceneBreak" }]),
      };
  }
}

// Push the outgoing stage into the backlog IFF it was a transient
// transcript-worthy beat (narration / dialogue). Menus / errors / loading
// don't get preserved — they're UI state, not story.
function demote(stage: Stage, backlog: BacklogEntry[]): BacklogEntry[] {
  if (stage.kind === "narration") {
    return capBacklog([...backlog, { kind: "narration", text: stage.text }]);
  }
  if (stage.kind === "dialogue") {
    return capBacklog([
      ...backlog,
      { kind: "dialogue", speakerName: stage.speakerName, text: stage.text },
    ]);
  }
  return backlog;
}

function capBacklog(entries: BacklogEntry[]): BacklogEntry[] {
  if (entries.length <= BACKLOG_CAP) return entries;
  return entries.slice(entries.length - BACKLOG_CAP);
}
