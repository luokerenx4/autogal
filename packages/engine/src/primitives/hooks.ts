import type { PresetContext } from "../types";

// fireHook is the dispatch helper for lifecycle hooks declared on the
// Module interface. C1 ships a stub: hooks themselves are added in C2.
// The function exists now so primitives and presets can call it at the
// right fire-points and C2 only changes the Module surface, not the
// call sites.
//
// Compose semantics (per-hook, documented in JSDoc on Module fields
// once added in C2):
//   - observer: iterate all modules, ignore returns
//   - first-wins: iterate, stop at first non-undefined return
//   - reducer: chain transforms (first arg threaded through)
//
// For C1 this is a no-op since no hook fields exist on Module yet.
export function fireHook(
  _ctx: PresetContext,
  _name: string,
  ..._args: unknown[]
): void {
  // intentionally empty until C2 adds the hook signatures + dispatch
}
