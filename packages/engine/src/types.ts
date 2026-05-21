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
  pendingNarrations?: string[];
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
  thresholds?: StatThreshold[];
}

export interface StatThreshold {
  min: number;
  label: string;
  color?: "green" | "yellow" | "red" | "cyan" | "magenta" | "white";
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
  initialize?(game: Game): unknown;
  // Map of action.kind → handler. When the engine dispatches an Action
  // whose `kind` matches one of the keys, this handler is invoked.
  // Handlers MUST resolve atomically (see ActionHandler doc below).
  actionHandlers?: Record<string, ActionHandler>;
  // Lifecycle hooks fired by the engine after the corresponding event.
  // Mutate state in place; do NOT yield narrations from here — push into
  // state.training?.pendingNarrations if you need them shown.
  onSlotAdvance?(state: ComposedState, game: Game): void;
  onDayRollover?(state: ComposedState, game: Game): void;
  onScriptComplete?(state: ComposedState, game: Game, scriptId: string): void;
}

// ActionHandler invariant: must resolve ATOMICALLY. The handler computes
// the entire outcome of the action (rolls, branches, state mutations,
// narration text) and returns it as a single ActionResult. The engine
// then applies deltas and enqueues narrations. The handler MUST NOT
// yield through multiple steps via persisted in-memory state — that
// pattern broke combat-in-step mode before this refactor. If your
// action needs multi-step narrative pacing, push the lines into
// `narrations` and the engine's main loop will drain them one per step.
export type ActionHandler = (ctx: ActionContext) => ActionResult;

export interface ActionContext {
  state: ComposedState;
  action: Action;
  game: Game;
  // Inject randomness here so handlers can be tested deterministically.
  rng: () => number;
}

export interface ActionResult {
  // Narration lines shown one-at-a-time, in order, on subsequent steps.
  narrations?: string[];
  // Aggregated state changes; the engine calls applyDelta(state, deltas).
  deltas?: StateDelta;
  // Optional opaque payload appended to a module-owned log array at
  // state[moduleId].log[]. Useful for combat logs, debug traces, etc.
  customLog?: { moduleId: string; entry: unknown };
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
  thresholds?: StatThreshold[];
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
