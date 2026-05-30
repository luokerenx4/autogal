import type { StateDelta } from "@rpg-harness/engine";

// Inline token grammar:
//   +alice              → +1 alice.affection
//   -alice              → -1 alice.affection
//   +2alice             → +2 alice.affection
//   +alice.trust        → +1 alice.trust (explicit stat name)
//   -3bea.anger         → -3 bea.anger
const INLINE_PATTERN =
  /^([+-])(\d*)([a-zA-Z_][a-zA-Z0-9_]*)(?:\.([a-zA-Z_][a-zA-Z0-9_]*))?$/;

export function parseInlineEffects(text: string): StateDelta | undefined {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return undefined;
  const characterStats: Record<string, Record<string, number>> = {};
  for (const token of tokens) {
    const m = token.match(INLINE_PATTERN);
    if (!m) continue;
    const sign = m[1] === "+" ? 1 : -1;
    const magnitude = m[2] ? Number(m[2]) : 1;
    const target = m[3];
    if (!target) continue;
    const statName = m[4] ?? "affection";
    const charStats = (characterStats[target] = characterStats[target] ?? {});
    charStats[statName] = (charStats[statName] ?? 0) + sign * magnitude;
  }
  if (Object.keys(characterStats).length === 0) return undefined;
  return { characterStats };
}
