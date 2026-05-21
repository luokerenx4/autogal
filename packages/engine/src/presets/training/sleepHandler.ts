import type { ActionHandler } from "../../types";

// "Sleep" action kind handler. Restore physical-family stats to their
// max + apply the action's other effects from yaml (mental/spectral
// deltas). Returns a consolidated delta rather than mutating state
// directly so onStateMutated (from C2) fires uniformly through
// applyActionResult.
export const sleepHandler: ActionHandler = ({ state, action }) => {
  const t = state.training;
  if (!t) return {};

  const stats: Record<string, number> = {};
  // Pass through non-physical-family stat effects from action.effects.
  for (const [k, v] of Object.entries(action.effects?.stats ?? {})) {
    if (k === "physical" || k === "energy" || k === "stamina") continue;
    stats[k] = v;
  }
  // Physical-family stats: delta-to-max (sleep restores regardless of
  // action.effects intent for these slots).
  for (const statId of Object.keys(t.stats)) {
    if (statId === "physical" || statId === "energy" || statId === "stamina") {
      const max = t.statMax[statId] ?? t.stats[statId]!;
      const cur = t.stats[statId] ?? 0;
      if (max > cur) stats[statId] = max - cur;
    }
  }

  return {
    deltas: {
      ...(action.effects ?? {}),
      stats,
    },
  };
};
