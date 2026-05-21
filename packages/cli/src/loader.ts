import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  Action,
  CharacterDef,
  EnemyDef,
  Game,
  ItemDef,
  Module,
  RunFunction,
  Script,
  WeaponDef,
} from "@autogal/engine";
import {
  buildGame,
  parseAction,
  parseCharacter,
  parseEnemy,
  parseItem,
  parseManifest,
  parseScript,
  parseWeapon,
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

  const items = await loadDir<ItemDef>(
    path.join(dir, "items"),
    [".md"],
    (content, source) => parseItem(content, source),
  );
  items.sort((a, b) => a.id.localeCompare(b.id));

  const enemies = await loadDir<EnemyDef>(
    path.join(dir, "enemies"),
    [".md"],
    (content, source) => parseEnemy(content, source),
  );
  enemies.sort((a, b) => a.id.localeCompare(b.id));

  const weapons = await loadDir<WeaponDef>(
    path.join(dir, "weapons"),
    [".md"],
    (content, source) => parseWeapon(content, source),
  );
  weapons.sort((a, b) => a.id.localeCompare(b.id));

  const modules = await loadModules(dir, manifest.modules ?? []);

  const game = buildGame(
    manifest,
    characters,
    scripts,
    actions,
    modules,
    items,
    enemies,
    weapons,
  );

  // If game.yaml's preset: is a relative path (the ejected-preset case),
  // dynamic-import the file and attach its default-exported RunFunction
  // to game.runFn. Engine prefers game.runFn over the preset name.
  if (manifest.preset && isRelativePath(manifest.preset)) {
    const abs = path.resolve(dir, manifest.preset);
    const imported = (await import(abs)) as { default?: unknown };
    const fn = imported.default;
    if (typeof fn !== "function") {
      throw new Error(
        `Preset at ${manifest.preset} must default-export a RunFunction (got ${typeof fn})`,
      );
    }
    game.runFn = fn as RunFunction;
  }

  return game;
}

function isRelativePath(s: string): boolean {
  return s.startsWith("./") || s.startsWith("../");
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
