import type { Action, CharacterDef, Game, Script } from "@autogal/engine";
import type { Manifest } from "./manifest";

export { parseScript, ScriptParseError } from "./script";
export { parseManifest, ManifestParseError } from "./manifest";
export { parseCharacter, CharacterParseError } from "./character";
export { parseCondition, ConditionParseError } from "./condition";
export { parseAction, ActionParseError } from "./action";
export type { Manifest } from "./manifest";

export function buildGame(
  manifest: Manifest,
  characters: CharacterDef[],
  scripts: Script[],
  actions?: Action[],
): Game {
  const game: Game = {
    title: manifest.title,
    characters,
    scripts,
  };
  if (actions && actions.length > 0) game.actions = actions;
  if (manifest.training) game.training = manifest.training;
  return game;
}
