import type { Input } from "@autogal/engine";
import type { Stage } from "./screen-model";

// Pure mapping from (current stage + keypress) → engine Input, or null
// when the key isn't meaningful for the current stage. PlayScreen wires
// this into ink's useInput.
//
// Global keys (Esc → open menu, `b` → backlog toggle) are handled at
// the PlayScreen layer before reaching this dispatcher.

export interface KeyEvent {
  return?: boolean;
  // ink also exposes ctrl/meta/etc — we don't need them for the engine
  // protocol today.
}

export function dispatchStageInput(
  stage: Stage,
  input: string,
  key: KeyEvent,
): Input | null {
  switch (stage.kind) {
    case "narration":
    case "dialogue":
      if (key.return || input === " ") return { type: "next" };
      return null;
    case "choice": {
      const n = parseDigit(input);
      if (n === null || n < 1 || n > stage.options.length) return null;
      const opt = stage.options[n - 1];
      if (!opt || !opt.available) return null;
      return { type: "choose", index: n - 1 };
    }
    case "hubMenu": {
      const acts = stage.snapshot.activities;
      const n = parseDigit(input);
      if (n === null || n < 1 || n > acts.length) return null;
      const act = acts[n - 1];
      if (!act || !act.available) return null;
      return { type: "doActivity", id: act.id };
    }
    case "scriptComplete": {
      const n = parseDigit(input);
      if (n === null || n < 1 || n > stage.nextAvailable.length) return null;
      const choice = stage.nextAvailable[n - 1];
      if (!choice) return null;
      return { type: "select", scriptId: choice.id };
    }
    case "loading":
    case "error":
    case "ended":
      return null;
  }
}

function parseDigit(input: string): number | null {
  if (input.length !== 1) return null;
  const n = Number(input);
  if (!Number.isInteger(n)) return null;
  return n;
}

// Footer hint text per stage — drives the bottom-line "what keys do I
// have right now" UX. Always appended with the global suffix in
// PlayScreen so the player knows about Esc / b.
export function footerHintFor(stage: Stage): string {
  switch (stage.kind) {
    case "narration":
    case "dialogue":
      return "Enter/空格 继续";
    case "choice":
      return "按数字选择";
    case "hubMenu":
      return "按数字选活动";
    case "scriptComplete":
      return "按数字选下一段";
    case "ended":
    case "error":
    case "loading":
      return "";
  }
}
