import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  Action,
  CharacterDef,
  Game,
  Module,
  Script,
} from "@autogal/engine";
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

  const modules = await loadModules(dir, manifest.modules ?? []);

  return buildGame(manifest, characters, scripts, actions, modules);
}

async function loadModules(
  gameDir: string,
  paths: string[],
): Promise<Module[]> {
  const modules: Module[] = [];
  for (const rel of paths) {
    const abs = path.resolve(gameDir, rel);
    const imported = (await import(abs)) as { default?: unknown };
    const mod = imported.default;
    if (!mod || typeof mod !== "object" || typeof (mod as Module).id !== "string") {
      throw new Error(
        `Module at ${rel} must export a default Module with a string \`id\``,
      );
    }
    modules.push(mod as Module);
  }
  return modules;
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
