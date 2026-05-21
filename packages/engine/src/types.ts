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

export interface TrainingState {
  day: number;
  slot: number;
  stats: Record<string, number>;
  statMax: Record<string, number>;
  combatLog: CombatLogEntry[];
}

export interface CombatLogEntry {
  day: number;
  enemyHp: number;
  damage: number;
  crit: boolean;
  fumble: boolean;
  victory: boolean;
  spectralDelta: number;
}

export interface ComposedState {
  baseline: BaselineState;
  training?: TrainingState;
  [namespace: string]: unknown;
}

export interface CharacterDef {
  id: string;
  name: string;
  defaultAffection?: number;
}

export interface StatDef {
  id: string;
  name: string;
  min: number;
  max: number;
  start: number;
}

export interface TrainingConfig {
  slotsPerDay: number;
  slotNames: string[];
  startDay: number;
  maxDay: number;
  stats: StatDef[];
  decayPerDay: number;
  decayStatId: string;
  sleepActionId: string;
  huntActionId: string;
  endConditions: EndConditionSpec[];
}

export type EndConditionSpec = {
  goto?: string;
  reason: string;
  when: Condition;
};

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { scriptCompleted: string }
  | { affection: { character: string; min?: number; max?: number; eq?: number } }
  | { flag: { name: string; eq?: FlagValue; min?: number; max?: number } }
  | { stat: { name: string; min?: number; max?: number; eq?: number } }
  | { day: { min?: number; max?: number; eq?: number } }
  | { slot: { min?: number; max?: number; eq?: number } };

export interface StateDelta {
  affection?: Record<string, number>;
  flags?: Record<string, FlagValue>;
  stats?: Record<string, number>;
  statMax?: Record<string, number>;
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

export interface Script {
  id: string;
  title: string;
  requires?: Condition;
  characters?: string[];
  beats: Beat[];
}

export interface Action {
  id: string;
  title: string;
  description?: string;
  category?: string;
  cost: number;
  slot?: "any" | "day" | "night";
  requires?: Condition;
  effects?: StateDelta;
  kind?: "combat" | "sleep" | "plain";
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
  actions?: Action[];
  training?: TrainingConfig;
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

export interface HubActivity {
  id: string;
  kind: "script" | "action";
  title: string;
  description?: string;
  category?: string;
  cost: number;
  effectsHint?: string;
  available: boolean;
  lockedReason?: string;
}

export interface StatSnapshot {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
}

export interface HubSnapshot {
  day: number;
  maxDay: number;
  slot: number;
  slotName: string;
  slotsPerDay: number;
  stats: StatSnapshot[];
  affections: Array<{ id: string; name: string; value: number }>;
  activities: HubActivity[];
}

export type Output =
  | { type: "narration"; text: string }
  | { type: "dialogue"; speakerId: string; speakerName: string; text: string }
  | { type: "choice"; prompt?: string; options: RenderedChoice[] }
  | { type: "scriptComplete"; completedId: string | null; nextAvailable: ScriptInfo[] }
  | { type: "hubMenu"; snapshot: HubSnapshot }
  | { type: "gameEnd"; reason?: string }
  | { type: "clear" };

export type Input =
  | { type: "next" }
  | { type: "choose"; index: number }
  | { type: "select"; scriptId: string }
  | { type: "doActivity"; id: string }
  | { type: "quit" };

export const END_LABEL = "$end";
