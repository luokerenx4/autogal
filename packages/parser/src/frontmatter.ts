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
