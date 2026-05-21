import type { PresetContext, StateMutationSource } from "../types";
import { mutateState } from "./mutateState";

// Engine-level standard skill primitives. Skills are learnable
// abilities — distinct from actions in that they're stored in
// state.baseline.knownSkills and gated by player knowledge, not by
// stat thresholds. Gameplay modules call these instead of touching
// knownSkills directly so onStateMutated + reactive triggers fire.

export function hasSkill(ctx: PresetContext, skillId: string): boolean {
  return ctx.state.baseline.knownSkills.includes(skillId);
}

// Teach the player a skill. Idempotent — calling twice with the same
// id is a no-op (applyDelta de-duplicates).
export function learnSkill(
  ctx: PresetContext,
  skillId: string,
  source: StateMutationSource = "skill",
): boolean {
  if (hasSkill(ctx, skillId)) return false;
  mutateState(ctx, { skills: { learn: [skillId] } }, source);
  return true;
}

// Forget a skill. Returns false if the player didn't have it.
export function forgetSkill(
  ctx: PresetContext,
  skillId: string,
  source: StateMutationSource = "skill",
): boolean {
  if (!hasSkill(ctx, skillId)) return false;
  mutateState(ctx, { skills: { forget: [skillId] } }, source);
  return true;
}
