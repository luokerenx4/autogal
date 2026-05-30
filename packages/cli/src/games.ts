import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseManifest } from "@rpg-harness/parser";

export interface GameCandidate {
  dir: string;
  relPath: string;
  title: string;
  // Mirrors the manifest's `hidden:` flag. `discoverGames` filters
  // hidden candidates out by default; callers that want to show
  // everything (e.g. `rpgh sessions --all`) pass includeHidden.
  hidden: boolean;
}

export interface DiscoverOptions {
  // If true, return hidden candidates too. Default false.
  includeHidden?: boolean;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".rpg-harness",
  "dist",
  "build",
  ".cache",
]);

export async function discoverGames(
  roots: string[],
  opts: DiscoverOptions = {},
): Promise<GameCandidate[]> {
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
  const all = [...seen.values()].sort((a, b) =>
    a.relPath.localeCompare(b.relPath),
  );
  return opts.includeHidden ? all : all.filter((c) => !c.hidden);
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
  let hidden = false;
  try {
    const m = parseManifest(content);
    if (m.title) title = m.title;
    if (m.hidden === true) hidden = true;
  } catch {
    // keep basename fallback
  }
  out.set(dir, {
    dir,
    relPath: path.relative(process.cwd(), dir) || ".",
    title,
    hidden,
  });
}
