import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseManifest } from "@autogal/parser";

export interface GameCandidate {
  dir: string;
  relPath: string;
  title: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".autogal",
  "dist",
  "build",
  ".cache",
]);

export async function discoverGames(roots: string[]): Promise<GameCandidate[]> {
  const seen = new Map<string, GameCandidate>();
  for (const root of roots) {
    const abs = path.resolve(root);
    await tryAdd(abs, seen);
    let entries: string[];
    try {
      entries = await readdir(abs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const sub = path.join(abs, name);
      let s;
      try {
        s = await stat(sub);
      } catch {
        continue;
      }
      if (s.isDirectory()) await tryAdd(sub, seen);
    }
  }
  return [...seen.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}

async function tryAdd(
  dir: string,
  out: Map<string, GameCandidate>,
): Promise<void> {
  if (out.has(dir)) return;
  let content: string;
  try {
    content = await readFile(path.join(dir, "game.yaml"), "utf-8");
  } catch {
    return;
  }
  let title = path.basename(dir);
  try {
    const m = parseManifest(content);
    if (m.title) title = m.title;
  } catch {
    // keep basename fallback
  }
  out.set(dir, {
    dir,
    relPath: path.relative(process.cwd(), dir) || ".",
    title,
  });
}
