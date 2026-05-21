import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Action, CharacterDef, Game, Script } from "@autogal/engine";
import {
  buildGame,
  parseAction,
  parseCharacter,
  parseManifest,
  parseScript,
} from "@autogal/parser";

export async function loadGame(dir: string): Promise<Game> {
  const manifestPath = path.join(dir, "game.yaml");
  const manifest = parseManifest(await readFile(manifestPath, "utf-8"));

  const characters = await loadDir<CharacterDef>(
    path.join(dir, "characters"),
    [".md"],
    parseCharacter,
  );
  const scripts = await loadDir<Script>(
    path.join(dir, "scripts"),
    [".md"],
    (content, source) => parseScript(content, source),
  );
  scripts.sort((a, b) => a.id.localeCompare(b.id));

  const actions = await loadDir<Action>(
    path.join(dir, "actions"),
    [".yaml", ".yml"],
    (content, source) => parseAction(content, source),
  );

  return buildGame(manifest, characters, scripts, actions);
}

async function loadDir<T>(
  dir: string,
  exts: string[],
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
    .filter((e) => exts.some((ext) => e.endsWith(ext)))
    .map((e) => path.join(dir, e))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf-8");
      return parse(content, file);
    }),
  );
}
