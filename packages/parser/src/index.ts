import type {
  Action,
  CharacterDef,
  EnemyDef,
  Game,
  ItemDef,
  Module,
  Script,
} from "@autogal/engine";
import type { Manifest } from "./manifest";

export { parseScript, ScriptParseError } from "./script";
export { parseManifest, ManifestParseError } from "./manifest";
export { parseCharacter, CharacterParseError } from "./character";
export { parseCondition, ConditionParseError } from "./condition";
export { parseAction, ActionParseError } from "./action";
export { parseItem, ItemParseError } from "./item";
export { parseEnemy, EnemyParseError } from "./enemy";
export type { Manifest } from "./manifest";

export function buildGame(
  manifest: Manifest,
  characters: CharacterDef[],
  scripts: Script[],
  actions?: Action[],
  modules?: Module[],
  items?: ItemDef[],
  enemies?: EnemyDef[],
): Game {
  const game: Game = {
    title: manifest.title,
    characters,
    scripts,
  };
  if (actions && actions.length > 0) game.actions = actions;
  if (items && items.length > 0) game.items = items;
  if (enemies && enemies.length > 0) game.enemies = enemies;
  if (manifest.training) game.training = manifest.training;
  if (modules && modules.length > 0) game.modules = modules;
  if (manifest.preset) game.preset = manifest.preset;
  return game;
}
