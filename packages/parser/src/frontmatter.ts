import matter from "gray-matter";

export interface Frontmatter {
  meta: Record<string, unknown>;
  body: string;
}

export function splitFrontmatter(content: string): Frontmatter {
  const parsed = matter(content);
  return {
    meta: (parsed.data ?? {}) as Record<string, unknown>,
    body: parsed.content,
  };
}

// Pull every frontmatter key that's NOT in `knownKeys` into a custom
// passthrough bag. This is what each Def-parser uses to preserve
// game-specific metadata (sell_value, attack_power, rarity, etc.)
// without each parser needing to enumerate every game's vocabulary.
// Returns undefined when there are no unknown keys so the Def stays
// tidy (no empty {} fields littered through state dumps).
export function extractCustom(
  meta: Record<string, unknown>,
  knownKeys: readonly string[],
): Record<string, unknown> | undefined {
  const skip = new Set(knownKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!skip.has(k)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
