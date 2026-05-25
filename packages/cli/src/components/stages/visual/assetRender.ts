import { readFileSync } from "node:fs";
import type { AssetSpec } from "@autogal/engine";

// Selection result for one TUI-bound asset rendering. `kind` discriminates
// how the component should display the `content`:
//   - "ans": already ANSI-encoded; pass through ink's <Text> verbatim
//     (only SGR escapes — cursor-move sequences will break ink diffing)
//   - "txt": plain text; ink wraps and renders normally
//   - "placeholder": no rendering file present, falls back to spec.placeholder
//   - "missing": asset path itself didn't resolve (engine carries paths,
//     spec is from a different load — defensive only; PR1's loader warns)
export type Rendering =
  | { kind: "ans"; content: string }
  | { kind: "txt"; content: string }
  | { kind: "placeholder"; content: string }
  | { kind: "missing" };

// File-content cache. Reading tui.txt / tui.ans synchronously on every
// render would be wasteful (a Stage may re-render dozens of times per
// second on key input even when the asset hasn't changed). Cache by
// absolute path; the hot-reload watcher in PlayScreen invalidates by
// calling clearRenderingCache() before rebuilding the engine.
const cache = new Map<string, string>();

export function clearRenderingCache(): void {
  cache.clear();
}

// Pick the best available rendering for a given spec. Priority:
//   tui.ans  → richest (color)
//   tui.txt  → plain ASCII / unicode art
//   placeholder text  → spec.placeholder, ALWAYS available (required
//                       field in spec.yaml)
//
// File-read errors fall through to the next tier — a broken or
// permission-denied file shouldn't crash the game; player sees the
// placeholder instead.
export function selectRendering(spec: AssetSpec | undefined): Rendering {
  if (!spec) return { kind: "missing" };
  if (spec.renderings.tuiAns) {
    const content = readCached(spec.renderings.tuiAns);
    if (content !== null) return { kind: "ans", content };
  }
  if (spec.renderings.tuiTxt) {
    const content = readCached(spec.renderings.tuiTxt);
    if (content !== null) return { kind: "txt", content };
  }
  return { kind: "placeholder", content: spec.placeholder };
}

function readCached(absPath: string): string | null {
  const hit = cache.get(absPath);
  if (hit !== undefined) return hit;
  try {
    const content = readFileSync(absPath, "utf-8");
    cache.set(absPath, content);
    return content;
  } catch {
    return null;
  }
}
