import type { StateDelta } from "@autogal/engine";

const INLINE_PATTERN = /^([+-])(\d*)([a-zA-Z_][a-zA-Z0-9_]*)$/;

export function parseInlineEffects(text: string): StateDelta | undefined {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return undefined;
  const affection: Record<string, number> = {};
  for (const token of tokens) {
    const m = token.match(INLINE_PATTERN);
    if (!m) continue;
    const sign = m[1] === "+" ? 1 : -1;
    const magnitude = m[2] ? Number(m[2]) : 1;
    const target = m[3];
    if (!target) continue;
    affection[target] = (affection[target] ?? 0) + sign * magnitude;
  }
  if (Object.keys(affection).length === 0) return undefined;
  return { affection };
}
