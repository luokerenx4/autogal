export type FlagValue = number | string | boolean;

export interface CharacterState {
  affection: number;
  custom: Record<string, FlagValue>;
}

export interface BaselineState {
  characters: Record<string, CharacterState>;
  flags: Record<string, FlagValue>;
  completedScripts: string[];
  currentScriptId: string | null;
  beatIndex: number;
}

export interface ComposedState {
  baseline: BaselineState;
  [namespace: string]: unknown;
}

export interface CharacterDef {
  id: string;
  name: string;
  defaultAffection?: number;
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { scriptCompleted: string }
  | { affection: { character: string; min?: number; max?: number; eq?: number } }
  | { flag: { name: string; eq?: FlagValue; min?: number; max?: number } };

export interface StateDelta {
  affection?: Record<string, number>;
  flags?: Record<string, FlagValue>;
}

export type Beat =
  | { type: "narration"; text: string }
  | { type: "dialogue"; speaker: string; text: string }
  | { type: "choice"; prompt?: string; options: ChoiceOption[] }
  | { type: "effects"; effects: StateDelta }
  | { type: "clear" }
  | { type: "label"; name: string }
  | { type: "endScript" };

export interface ChoiceOption {
  text: string;
  requires?: Condition;
  effects?: StateDelta;
  goto?: string;
}

export const END_LABEL = "$end";

export interface Script {
  id: string;
  title: string;
  requires?: Condition;
  characters?: string[];
  beats: Beat[];
}

export interface Module {
  id: string;
  version?: string;
  initialize(game: Game): unknown;
}

export interface Game {
  title: string;
  characters: CharacterDef[];
  scripts: Script[];
  modules?: Module[];
}

export interface ScriptInfo {
  id: string;
  title: string;
}

export interface RenderedChoice {
  text: string;
  available: boolean;
  lockedReason?: string;
}

export type Output =
  | { type: "narration"; text: string }
  | { type: "dialogue"; speakerId: string; speakerName: string; text: string }
  | { type: "choice"; prompt?: string; options: RenderedChoice[] }
  | { type: "scriptComplete"; completedId: string | null; nextAvailable: ScriptInfo[] }
  | { type: "gameEnd" }
  | { type: "clear" };

export type Input =
  | { type: "next" }
  | { type: "choose"; index: number }
  | { type: "select"; scriptId: string }
  | { type: "quit" };
