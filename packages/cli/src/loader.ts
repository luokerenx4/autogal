import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { CharacterDef, Game, Script } from "@autogal/engine";
import {
  buildGame,
  parseCharacter,
  parseManifest,
  parseScript,
} from "@autogal/parser";

export async function loadGame(dir: string): Promise<Game> {
  const manifestPath = path.join(dir, "game.yaml");
  const manifest = parseManifest(await readFile(manifestPath, "utf-8"));

  const characters = await loadDir<CharacterDef>(
    path.join(dir, "characters"),
    parseCharacter,
  );
  const scripts = await loadDir<Script>(path.join(dir, "scripts"), (content, source) =>
    parseScript(content, source),
  );
  scripts.sort((a, b) => a.id.localeCompare(b.id));

  return buildGame(manifest, characters, scripts);
}

async function loadDir<T>(
  dir: string,
  parse: (content: string, source: string) => T,
): Promise<T[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const files = entries
    .filter((e) => e.endsWith(".md"))
    .map((e) => path.join(dir, e))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf-8");
      return parse(content, file);
    }),
  );
}
