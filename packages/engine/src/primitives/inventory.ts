import type { PresetContext, StateMutationSource } from "../types";
import { mutateState } from "./mutateState";

// Engine-level standard inventory primitives. Gameplay modules call
// these instead of touching state.baseline.inventory directly — that
// way onStateMutated + reactive triggers fire correctly via mutateState,
// and the stack/non-stack invariant is enforced in one place.

// Read-only check. Returns true when the player owns >= min of itemId.
// Default min=1 is the "do you have any?" check.
export function hasItem(
  ctx: PresetContext,
  itemId: string,
  min = 1,
): boolean {
  return (ctx.state.baseline.inventory[itemId] ?? 0) >= min;
}

// Give `count` of itemId to the player. Refuses if count <= 0 (use
// consumeItem for the negative direction). Refuses to push count above
// 1 for items declared with `stack: false` (key items) — the existing
// count caps at 1, additional give attempts silently no-op.
//
// Returns true if any change applied, false otherwise.
export function giveItem(
  ctx: PresetContext,
  itemId: string,
  count = 1,
  source: StateMutationSource = "item",
): boolean {
  if (count <= 0) return false;
  const def = ctx.itemMap.get(itemId);
  if (def && def.stack === false) {
    if (hasItem(ctx, itemId, 1)) return false; // already have the unique key
    // Only ever bump to 1 for non-stack items, regardless of count.
    mutateState(ctx, { inventory: { [itemId]: 1 } }, source);
    return true;
  }
  mutateState(ctx, { inventory: { [itemId]: count } }, source);
  return true;
}

// Consume `count` of itemId. Returns false (no mutation) if the player
// doesn't have enough. Returns true after mutating. The "loud" failure
// for callers — the useItem handler reads this return value and
// no-ops if false rather than letting applyDelta silently clamp.
export function consumeItem(
  ctx: PresetContext,
  itemId: string,
  count = 1,
  source: StateMutationSource = "item",
): boolean {
  if (count <= 0) return false;
  if (!hasItem(ctx, itemId, count)) return false;
  mutateState(ctx, { inventory: { [itemId]: -count } }, source);
  return true;
}
