import type {
  PresetContext,
  StateMutationSource,
  WeaponState,
} from "../types";
import { mutateState } from "./mutateState";

// Engine-level standard weapon primitives. Gameplay modules call these
// instead of touching state.baseline.weapons / equippedWeaponId
// directly — mutateState wraps so onStateMutated + reactive triggers
// fire correctly.

// Get the currently-equipped weapon's runtime state, or undefined if
// nothing is equipped. Combat handlers typically call this to read
// `power` for their damage formulas.
export function getEquippedWeapon(
  ctx: PresetContext,
): WeaponState | undefined {
  const id = ctx.state.baseline.equippedWeaponId;
  if (!id) return undefined;
  return ctx.state.baseline.weapons[id];
}

// Convenience: get current power of equipped weapon, or 0 if none.
export function getEquippedWeaponPower(ctx: PresetContext): number {
  return getEquippedWeapon(ctx)?.power ?? 0;
}

// Read a specific weapon's current power. Returns 0 if the weapon
// isn't declared in game.weapons.
export function getWeaponPower(
  ctx: PresetContext,
  weaponId: string,
): number {
  return ctx.state.baseline.weapons[weaponId]?.power ?? 0;
}

// Equip a weapon by id. Refuses if the id isn't a declared weapon.
// Mutates state.baseline.equippedWeaponId directly (no delta path —
// equipment is a discrete choice, not an accumulating delta) but still
// fires onStateMutated for observers.
export function equipWeapon(
  ctx: PresetContext,
  weaponId: string | null,
  source: StateMutationSource = "weapon",
): boolean {
  if (weaponId !== null && !ctx.state.baseline.weapons[weaponId]) return false;
  ctx.state.baseline.equippedWeaponId = weaponId;
  // Synthetic empty delta — observers see the "something changed"
  // signal with source=weapon. (No state field on Delta represents
  // equipment changes today; if a future module needs this it can
  // diff the state itself.)
  mutateState(ctx, {}, source);
  return true;
}
