import type { AssetSpec, VisualState } from "@rpg-harness/engine";

// One resolved slot — the asset's path plus its placeholder text.
// Placeholder is what headless consumers (AI players, CI scripts,
// stderr loggers) read to know what the slot *means*; the path lets
// them correlate against the spec or look up the full description.
export interface VisualSlot {
  path: string;
  placeholder: string;
}

// Same shape as engine VisualState, but each non-null asset path has
// been joined with its spec's placeholder text. `null`s and missing
// (unknown to assetMap) paths pass through as null. Designed for
// drop-in serialization on top of Output.visualState.
export interface JoinedVisualState {
  bg: VisualSlot | null;
  portraits: Record<string, VisualSlot | null>;
  cg: VisualSlot | null;
}

// Join a VisualState with an AssetSpec map so each non-null slot
// carries its placeholder text alongside the path. Unknown paths
// (asset removed, spec missing) become null — the engine doesn't
// pre-validate references, so consumers must tolerate dangling.
export function joinVisualState(
  visual: VisualState | undefined,
  assetMap: Map<string, AssetSpec>,
): JoinedVisualState {
  if (!visual) {
    return { bg: null, portraits: {}, cg: null };
  }
  const portraits: Record<string, VisualSlot | null> = {};
  for (const [slot, p] of Object.entries(visual.portraits)) {
    portraits[slot] = resolveSlot(p, assetMap);
  }
  return {
    bg: resolveSlot(visual.bg, assetMap),
    portraits,
    cg: resolveSlot(visual.cg, assetMap),
  };
}

function resolveSlot(
  p: string | null,
  assetMap: Map<string, AssetSpec>,
): VisualSlot | null {
  if (!p) return null;
  const spec = assetMap.get(p);
  if (!spec) return { path: p, placeholder: `(unknown asset: ${p})` };
  return { path: p, placeholder: spec.placeholder };
}

// Diff two VisualStates and emit one framing line per *changed* slot.
// Used by text-mode autoplay/stderr to avoid spamming a line on every
// dialogue when the visuals haven't moved. The first call (prev =
// emptyVisualState) prints whatever's set initially; subsequent calls
// only print deltas.
//
// Output lines look like:
//   [bg: assets/backgrounds/mura-yugata · "黄昏の村はずれ、藁葺き屋根の集落"]
//   [portrait center: assets/portraits/kagari-smile · "微笑む霞"]
//   [portrait center: cleared]
//   [cg: assets/cgs/first-encounter · "..."]
//   [cg: cleared]
export function diffVisualLines(
  prev: VisualState,
  next: VisualState,
  assetMap: Map<string, AssetSpec>,
): string[] {
  const lines: string[] = [];
  if (prev.bg !== next.bg) {
    lines.push(formatLine("bg", next.bg, assetMap));
  }
  const slots = new Set([
    ...Object.keys(prev.portraits),
    ...Object.keys(next.portraits),
  ]);
  for (const slot of slots) {
    const prevP = prev.portraits[slot] ?? null;
    const nextP = next.portraits[slot] ?? null;
    if (prevP !== nextP) {
      lines.push(formatLine(`portrait ${slot}`, nextP, assetMap));
    }
  }
  if (prev.cg !== next.cg) {
    lines.push(formatLine("cg", next.cg, assetMap));
  }
  return lines;
}

function formatLine(
  label: string,
  assetPath: string | null,
  assetMap: Map<string, AssetSpec>,
): string {
  if (assetPath === null) {
    return `[${label}: cleared]`;
  }
  const spec = assetMap.get(assetPath);
  const placeholder = spec ? spec.placeholder : `(unknown asset)`;
  return `[${label}: ${assetPath} · "${placeholder}"]`;
}
