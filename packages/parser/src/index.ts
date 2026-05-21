import type { CharacterDef, Game, Script } from "@autogal/engine";
import { type Manifest } from "./manifest";

export { parseScript, ScriptParseError } from "./script";
export { parseManifest, ManifestParseError } from "./manifest";
export { parseCharacter, CharacterParseError } from "./character";
export { parseCondition, ConditionParseError } from "./condition";
export type { Manifest } from "./manifest";

export function buildGame(
  manifest: Manifest,
  characters: CharacterDef[],
  scripts: Script[],
): Game {
  return {
    title: manifest.title,
    characters,
    scripts,
  };
}
