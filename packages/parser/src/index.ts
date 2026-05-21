import type {
  Action,
  CharacterDef,
  EnemyDef,
  Game,
  ItemDef,
  Module,
  Script,
  WeaponDef,
} from "@autogal/engine";
import type { Manifest } from "./manifest";

export { parseScript, ScriptParseError } from "./script";
export { parseManifest, ManifestParseError } from "./manifest";
export { parseCharacter, CharacterParseError } from "./character";
export { parseCondition, ConditionParseError } from "./condition";
export { parseAction, ActionParseError } from "./action";
export { parseItem, ItemParseError } from "./item";
export { parseEnemy, EnemyParseError } from "./enemy";
export { parseWeapon, WeaponParseError } from "./weapon";
export type { Manifest } from "./manifest";

export function buildGame(
  manifest: Manifest,
  characters: CharacterDef[],
  scripts: Script[],
  actions?: Action[],
  modules?: Module[],
  items?: ItemDef[],
  enemies?: EnemyDef[],
  weapons?: WeaponDef[],
): Game {
  const game: Game = {
    title: manifest.title,
    characters,
    scripts,
  };
  if (actions && actions.length > 0) game.actions = actions;
  if (items && items.length > 0) game.items = items;
  if (enemies && enemies.length > 0) game.enemies = enemies;
  if (weapons && weapons.length > 0) game.weapons = weapons;
  if (manifest.training) game.training = manifest.training;
  if (modules && modules.length > 0) game.modules = modules;
  if (manifest.preset) game.preset = manifest.preset;
  return game;
}
