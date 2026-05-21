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
  // Engine-owned standard inventory schema. Counts keyed by item id.
  // Invariant: keys with count <= 0 are deleted by applyDelta, so a
  // present key always means count >= 1. Empty record for games that
  // declare no items.
  inventory: Record<string, number>;
  // Engine-owned runtime weapon instances. Keyed by weapon id; engine
  // initializes each declared WeaponDef with power = basePower at
  // game start. Mutations go through StateDelta.weapons.
  weapons: Record<string, WeaponState>;
  // Id of the currently equipped weapon, or null. Engine auto-equips
  // the only declared weapon at init; multi-weapon games equip via
  // the equipWeapon primitive.
  equippedWeaponId: string | null;
}

export interface TrainingState {
  day: number;
  slot: number;
  stats: Record<string, number>;
  statMax: Record<string, number>;
}

// Transient run-loop state. Lives outside any specific preset because
// any preset's main loop may need to queue narrations across step()
// boundaries. (Previously this was on TrainingState, which made it
// unreachable for non-training presets.)
export interface RuntimeState {
  pendingNarrations: string[];
  // Trigger ids whose `when` condition is currently satisfied. Used by
  // checkTriggers to detect rising-edge transitions (was false, now
  // true) and only fire then — not every time the condition is
  // satisfied. Falling edges (was true, now false) re-arm the trigger.
  activeTriggers: string[];
  // Trigger ids that have fired at least once (only tracked for
  // triggers declared with `once: true`). Prevents re-firing even on
  // future rising edges.
  firedTriggers: string[];
}

export interface ComposedState {
  baseline: BaselineState;
  runtime: RuntimeState;
  training?: TrainingState;
  [namespace: string]: unknown;
}

export interface CharacterDef {
  id: string;
  name: string;
  defaultAffection?: number;
}

// Engine-level standard item resource. Defined here (not in any
// gameplay module) so any module can assume this schema exists and
// use giveItem/consumeItem/hasItem primitives without reinventing.
// Gameplay modules that need item-shaped data outside this schema
// should namespace their own state slice under state[moduleId].
export interface ItemDef {
  id: string;
  name: string;
  // Markdown body of the .md file — for hub UI / inspection / AI
  // authoring context. Engine doesn't read it.
  description: string;
  kind: "consumable" | "key" | "gift";
  // Applied when the player uses this item via a kind: "useItem"
  // action. The engine's bundled useItem handler merges this with a
  // `-1` inventory delta for the item itself.
  effects?: StateDelta;
  // Default true. false marks unique key items — the bundled
  // giveItem primitive refuses to push count above 1 for non-stack
  // items so authors don't need to guard against double-pickup.
  stack?: boolean;
}

// Engine-level standard enemy resource. Combat modules read these to
// drive narration + base stats; specific damage formulas and HP
// scaling stay with the combat module (different games scale
// differently). Narrations support `{name}` and `{hp}` template
// substitution.
export interface EnemyDef {
  id: string;
  name: string;
  // Markdown body — flavor text for hub UI / inspection.
  description: string;
  // Base HP. Combat module may apply scaling (e.g. day-multiplier)
  // on top of this; engine doesn't.
  hp: number;
  // Optional misc stats — combat module decides how to use them
  // (attack power, defense, etc.). Empty for purely HP-driven enemies.
  stats?: Record<string, number>;
  narrations?: {
    // {hp}, {name} substituted at fire time.
    intro?: string;
    victory?: string;
    escape?: string;
  };
}

// Engine-level standard weapon resource. Engine owns the static
// definition (basePower, kind, properties); runtime instance state
// lives in state.baseline.weapons[id] (so authors can grow a weapon's
// power across the game). Combat modules pick the equipped weapon
// from state.baseline.equippedWeaponId and read its runtime power via
// the getWeaponPower primitive.
export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  // Starting power. state.baseline.weapons[id].power = basePower at
  // game init; subsequent mutations (e.g. night_study, hunt wins) add
  // to that.
  basePower: number;
  // Optional. Combat modules may dispatch differently on weapon kind
  // (e.g. melee vs spell-focus). Engine doesn't interpret it.
  kind?: string;
  // Open-ended properties for combat-module-specific use (crit bonus,
  // affinity, durability, etc.). Engine just stores them.
  properties?: Record<string, number>;
}

// Runtime state per weapon. Engine initializes each weapon's `power`
// to its WeaponDef.basePower; gameplay modules / action effects can
// mutate it via StateDelta.weapons.
export interface WeaponState {
  power: number;
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
  | { inventory: { itemId: string; min?: number; max?: number; eq?: number } }
  | {
      weaponPower: {
        weaponId: string;
        min?: number;
        max?: number;
        eq?: number;
      };
    }
  | { day: { min?: number; max?: number; eq?: number } }
  | { slot: { min?: number; max?: number; eq?: number } };

export interface StateDelta {
  affection?: Record<string, number>;
  flags?: Record<string, FlagValue>;
  stats?: Record<string, number>;
  statMax?: Record<string, number>;
  // Signed inventory deltas keyed by item id. applyDelta sums into
  // state.baseline.inventory and prunes any key whose result is <= 0,
  // preserving the "present key ⇔ count >= 1" invariant. Negative
  // deltas going below zero clamp to zero (key removed) rather than
  // throwing — the engine is forgiving here; handlers like consumeItem
  // do their own pre-validation for "loud" failures.
  inventory?: Record<string, number>;
  // Weapon runtime field deltas: { yaodao: { power: +2 } } adds 2 to
  // state.baseline.weapons.yaodao.power. applyDelta clamps to >= 0
  // but does not delete weapons whose power hits 0 (weapons persist
  // even at 0 power, unlike inventory items at 0 count).
  weapons?: Record<string, Partial<WeaponState>>;
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
  kind?: "combat" | "sleep" | "plain" | "useItem";
  // Required when kind === "useItem": id of the item this action
  // consumes. Resolved against ctx.itemMap by the bundled useItem
  // handler in baseline module.
  itemId?: string;
  // Optional: id of the enemy fought by this action. Used by combat
  // modules (game-provided) — engine does NOT dispatch on this field
  // directly. Resolved against ctx.enemyMap by combat handlers.
  enemyId?: string;
}

// Where a state mutation came from. Passed to onStateMutated so
// subscriber modules can filter cheaply without writing diff logic.
export type StateMutationSource =
  | "beat" // a script beat's effects: clause
  | "choice" // a chosen choice's effects
  | "action" // an action handler's returned deltas
  | "decay" // training preset's per-day decay
  | "endcondition" // an end-condition-triggered mutation
  | "trigger" // a reactive trigger's do() ActionResult deltas
  | "item" // giveItem / consumeItem / useItem-handler-produced
  | "weapon" // weapon power / properties mutation
  | "external"; // anything else (manual game scripts, hot-reload, etc.)

// Reactive trigger. Modules declare a list of these; the engine
// evaluates each one's `when` after every state mutation and fires
// `do` on rising-edge transitions (was false → now true). This is the
// RPGMaker "parallel process + conditional branch" idiom condensed
// into a declarative shape: "when this state condition becomes true,
// run this small piece of code."
//
// `do` returns an ActionResult — same shape as an action handler. Its
// deltas, narrations, and customLog apply through the engine's normal
// channels. Trigger-fired mutations are tagged source="trigger" on the
// onStateMutated hook and do NOT recursively trigger other triggers
// within the same wave (to avoid infinite loops). Authors who need
// cascades chain via flags observed by another trigger.
export interface Trigger {
  // Stable identifier, unique within the module. Used to track
  // active / fired state across step() boundaries.
  id: string;
  // Reuse the existing Condition AST (alice.affection >= 5, day >= 8,
  // etc.). evaluateCondition() is exported from @autogal/engine.
  when: Condition;
  // Returns an ActionResult to apply atomically when the trigger fires.
  // Receives the full PresetContext (state + game + rng + modules).
  do: TriggerHandler;
  // If true, fires at most once per game session. Future rising edges
  // are ignored. Useful for milestone events ("alice affection first
  // hits 5"). Default false: re-arms on falling edges.
  once?: boolean;
}

export type TriggerHandler = (ctx: PresetContext) => ActionResult;

export interface Module {
  id: string;
  version?: string;
  initialize?(game: Game): unknown;

  // Map of action.kind → handler. When the engine dispatches an Action
  // whose `kind` matches one of the keys, this handler is invoked.
  // Handlers MUST resolve atomically (see ActionHandler doc below).
  actionHandlers?: Record<string, ActionHandler>;

  // Reactive triggers. The engine evaluates each Trigger's `when`
  // after every state mutation; fires `do` on rising-edge transitions.
  // See Trigger doc for semantics.
  triggers?: Trigger[];

  // ============ LIFECYCLE HOOKS ============
  // All hooks fire SYNC. To emit narrations, push into
  // state.runtime.pendingNarrations — the run loop drains them on
  // subsequent steps. Do NOT yield Output from hooks (they're not
  // generators).
  //
  // Compose rules per hook (labelled in JSDoc, enforced by fireHook
  // dispatcher):
  //   - observer: every module called, returns ignored
  //   - first-wins: every module called (so downstream observers see
  //     the event), but only the first non-undefined return is used
  //   - reducer: chain transforms (prev return fed into next)

  /** observer: fires once at engine.run() entry, before any other work. */
  onSessionStart?(ctx: PresetContext): void;

  /** first-wins: return a different scriptId to redirect the selection. */
  onScriptSelect?(ctx: PresetContext, scriptId: string): string | void;

  /** observer: fires just before the first beat of a script yields. */
  onScriptStart?(ctx: PresetContext, scriptId: string): void;

  /**
   * reducer: pre-process the beat about to run. Return value:
   *   - `undefined` (or no return): use the original beat as-is
   *   - `{ replace: Beat }`: substitute the beat
   *   - `{ skip: true }`: don't yield this beat at all; advance beatIndex
   *   - `Beat` (bare): same as `{ replace: <beat> }` for ergonomic
   *     in-place edits like `{ ...beat, text: "..." }`
   */
  onBeatBefore?(
    ctx: PresetContext,
    scriptId: string,
    beatIdx: number,
    beat: Beat,
  ): Beat | { replace: Beat } | { skip: true } | void;

  /** observer: fires after each beat's input is processed (incl. skipped). */
  onBeatAfter?(
    ctx: PresetContext,
    scriptId: string,
    beatIdx: number,
    beat: Beat,
  ): void;

  /** reducer: chain transforms over the rendered options array. */
  onChoicePresented?(
    ctx: PresetContext,
    scriptId: string,
    beatIdx: number,
    options: RenderedChoice[],
  ): RenderedChoice[] | void;

  /** observer: fires after the player's choose input is processed. */
  onChoiceResolved?(
    ctx: PresetContext,
    scriptId: string,
    beatIdx: number,
    choiceIdx: number,
  ): void;

  /** observer: fires when runScript jumps into a label. */
  onLabelEnter?(
    ctx: PresetContext,
    scriptId: string,
    labelName: string,
  ): void;

  /** observer: fires after a script reaches [end] or its last beat. */
  onScriptComplete?(ctx: PresetContext, scriptId: string): void;

  /**
   * first-wins: pre-process or cancel an action dispatch. Return value:
   *   - `Action`: dispatch the returned action instead of the original
   *   - `"cancel"`: skip the dispatch entirely (action body doesn't run)
   *   - `undefined`: pass through unchanged
   */
  onActionDispatch?(
    ctx: PresetContext,
    action: Action,
  ): Action | "cancel" | void;

  /**
   * observer: fires after an action body and applyActionResult complete.
   * `result` is undefined when the engine treats a script completion as
   * a "1-slot action" for calendar bookkeeping. Replaces the
   * advanceAfterAction hook from PR #2.
   */
  onActionComplete?(
    ctx: PresetContext,
    action: Action,
    result: ActionResult | undefined,
  ): void;

  /**
   * observer: fires after every applyDelta-style mutation. `source`
   * lets subscribers filter without diffing state. High-volume — keep
   * implementations cheap.
   */
  onStateMutated?(
    ctx: PresetContext,
    delta: StateDelta,
    source: StateMutationSource,
  ): void;

  /**
   * first-wins: provide a hub Output for the current state. Used by
   * presets that have a hub (e.g. training). Replaces the
   * buildHubOutput hook from PR #2.
   */
  onHubBuild?(ctx: PresetContext): Output | undefined;

  /** observer: fires when an end-condition first matches and triggers. */
  onEndConditionFire?(
    ctx: PresetContext,
    ec: EndConditionSpec,
  ): void;

  /** observer: fires when one narration is shifted off the queue. */
  onNarrationDrain?(ctx: PresetContext, text: string): void;
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
  // Engine-level item registry — see ItemDef. Empty / absent for games
  // that declare no items/ directory.
  items?: ItemDef[];
  // Engine-level enemy registry — see EnemyDef. Empty / absent for
  // games that declare no enemies/ directory.
  enemies?: EnemyDef[];
  // Engine-level weapon registry — see WeaponDef. Empty / absent for
  // games that declare no weapons/ directory.
  weapons?: WeaponDef[];
  training?: TrainingConfig;
  modules?: Module[];
  // Preset selector. Either a built-in name ("vn" / "training") or a
  // relative path the loader resolved via dynamic import. When set as
  // a path, the loader fills `runFn` directly.
  preset?: string;
  // Resolved RunFunction (set by CLI loader after a path-based preset
  // is imported). Engine prefers this over the built-in lookup.
  runFn?: RunFunction;
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

// Context object threaded through preset run functions and primitives.
// Engine constructs this once per run; primitives accept it as their
// sole non-input argument so they can be tested in isolation without
// instantiating an Engine.
export interface PresetContext {
  state: ComposedState;
  game: Game;
  modules: Module[];
  // Aggregated action handler registry (action.kind → handler), built
  // once from all modules' actionHandlers. Duplicate kinds error at
  // construction time.
  actionHandlerRegistry: Record<string, ActionHandler>;
  // Aggregated trigger list (all modules.triggers concatenated in
  // declaration order). Trigger ids must be unique across all modules.
  triggerRegistry: Trigger[];
  // Precomputed lookup maps; cheap convenience, not authoritative.
  scriptMap: Map<string, Script>;
  actionMap: Map<string, Action>;
  itemMap: Map<string, ItemDef>;
  enemyMap: Map<string, EnemyDef>;
  weaponMap: Map<string, WeaponDef>;
  characterNameMap: Map<string, string>;
  // Injected RNG. Defaults to Math.random; tests can override for
  // deterministic combat / choice outcomes.
  rng: () => number;
}

// A preset's main loop. Engine.run() resolves which one to call based
// on game.preset (or auto-detection from game.training presence).
export type RunFunction = (
  ctx: PresetContext,
) => AsyncGenerator<Output, void, Input>;
