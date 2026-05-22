# Architecture

autogal is a "headless RPGMaker" — a small engine that runs games defined as folders of markdown + YAML. The engine yields semantic events; a frontend renders them. The same game folder runs in a terminal, in a browser, and inside a headless test harness.

## The three layers

```
┌──────────────────────────────────────────────────────────┐
│  Engine  (@autogal/engine)                                │
│  ─ Owns standard resource schemas (characters, items,     │
│    enemies, weapons, skills) and standard state slots.    │
│  ─ Owns primitives: runScript, dispatchActivity,          │
│    mutateState, checkTriggers, fireOn*, give/consumeItem, │
│    equipWeapon, learnSkill, …                             │
│  ─ Defines the Condition DSL, StateDelta, the Module      │
│    interface (action handlers + 15 lifecycle hooks +      │
│    reactive triggers), and the PresetContext that         │
│    threads through everything.                            │
│  ─ Does NOT decide what a "day" is, what a "battle" is,   │
│    what the hub looks like, or what an ending is.         │
└────────────────────────┬─────────────────────────────────┘
                         │ Output / Input via AsyncGenerator
┌────────────────────────┴─────────────────────────────────┐
│  Preset  (@autogal/engine/presets OR ./preset/run.ts)     │
│  ─ Owns the main loop. Composes engine primitives into a  │
│    genre-shaped play flow.                                │
│  ─ Two are bundled: `vn` (visual-novel, linear scripts)   │
│    and `training` (calendar + hub + actions + endings).   │
│  ─ A game can pick a bundled preset by name OR ship its   │
│    own run.ts (the "ejected" form).                       │
└────────────────────────┬─────────────────────────────────┘
                         │ consumes engine APIs
┌────────────────────────┴─────────────────────────────────┐
│  Game folder                                              │
│  ─ Pure content + optional gameplay modules.              │
│  ─ Standard resources go in standard directories          │
│    (characters/ items/ enemies/ weapons/ skills/          │
│    scripts/ actions/). Engine parses and types them.      │
│  ─ Custom mechanics ship as modules (action handlers +    │
│    hooks + triggers + their own state namespace).         │
└──────────────────────────────────────────────────────────┘
```

Same engine + same game folder + different frontend → same game, different shell.
Same engine + different game folder + same frontend → different game, same shell.

## Engine main loop

The engine is exposed as an `AsyncGenerator<Output, void, Input>`. The preset's `run.ts` is the loop body; `Engine.run()` is a one-liner that yields from it.

```ts
const engine = new Engine(game);
const loop = engine.run();
let input: Input = { type: "next" };
while (true) {
  const { value: output, done } = await loop.next(input);
  if (done) break;
  await frontend.render(output);
  input = await frontend.read(output);
}
```

The engine doesn't know whether the output ends up in a terminal, a browser, or a JSON stream. That is the frontend's job.

## Two play modes

Both modes go through the same engine, but they wrap it differently:

| Mode      | Where                              | Generator lifetime           | Use                           |
| --------- | ---------------------------------- | ---------------------------- | ----------------------------- |
| `runLoop` | `autogal play`, fixtures, autoplay | One engine, many `.next()`s  | Interactive / scripted replay |
| `step`    | AI playtester, batch evaluators    | Fresh engine per call        | Stateless query: state in, output(s) + state out |

`step` mode is why **ActionHandlers must resolve atomically** (see "Invariants" below) — if a handler yielded mid-resolution, the second call would create a fresh generator and lose the in-flight state.

## Standard resources (the database)

The engine owns five typed resource schemas. Each has: a `*Def` type, a directory the loader scans, a slot in `BaselineState`, optional `StateDelta` integration, optional `Condition` operators, and primitives for read/write.

| Resource     | Def type      | Game directory  | Runtime state                                              | Condition operators           | Bundled action handler |
| ------------ | ------------- | --------------- | ---------------------------------------------------------- | ----------------------------- | ---------------------- |
| Character    | `CharacterDef` | `characters/`   | `baseline.characters[id] = { affection, custom }`          | `affection`                   | —                      |
| Item         | `ItemDef`     | `items/`        | `baseline.inventory[id] = count`  (key absent ⇔ 0)         | `inventory`                   | `kind: useItem`        |
| Enemy        | `EnemyDef`    | `enemies/`      | (read-only; modules consume)                               | —                             | (modules)              |
| Weapon       | `WeaponDef`   | `weapons/`      | `baseline.weapons[id] = { power }` + `equippedWeaponId`    | `weaponPower`                 | —                      |
| Skill        | `SkillDef`    | `skills/`       | `baseline.knownSkills: string[]` (deduped)                 | `knowsSkill`                  | `kind: useSkill`       |

Invariants enforced by `applyDelta`:
- `inventory[id]` is deleted when it reaches ≤ 0 (no zero-count keys).
- `weapons[id].power` is clamped at 0 (no negative power).
- `knownSkills` is deduped on insert; absent ⇔ unlearned.

Resources are append-only at load time: the engine never mutates `ItemDef`/`EnemyDef`/`WeaponDef`/`SkillDef` objects. State mutations only ever touch `state.baseline.<slot>`.

Every Def also carries an optional `custom?: Record<string, unknown>` populated at parse time from any frontmatter key the parser doesn't recognize (via `extractCustom()` in `packages/parser/src/frontmatter.ts`). Game modules read game-specific metadata via `item.custom.sell_value` or `enemy.custom.attack_power`; the engine doesn't interpret it. This keeps the engine's `Def` shape minimal (only fields every game needs) while letting individual games attach arbitrary numbers, strings, and tags directly in the .md source-of-truth file instead of mirroring them in module-side lookup tables.

## Engine primitives

`packages/engine/src/primitives/` exposes the building blocks the preset loop and modules call. Each takes `PresetContext` and is side-effect-free except where named otherwise.

- `runScript(ctx, script)` — yield script beats, handle choice + effects, return on end.
- `drainNarrations(ctx)` — empty `runtime.pendingNarrations` as dialogue/narration outputs.
- `dispatchActivity(ctx, id)` — route a `doActivity` to a script or an action; action goes through registered handler.
- `applyActionResult(ctx, result)` — apply handler's `ActionResult` (deltas + narrations + scriptStart).
- `mutateState(ctx, delta, source)` — `applyDelta` + `fireOnStateMutated` + `checkTriggers`. The one true write path.
- `checkEndConditions(ctx)` — evaluate `game.training.endConditions` in order.
- `checkTriggers(ctx)` — rising-edge evaluation across all registered triggers.
- `fireOnXxx(ctx, ...)` — 15 hook dispatchers (see "Hooks").
- `giveItem` / `consumeItem` / `hasItem`.
- `equipWeapon` / `getWeaponPower` / `setWeaponPower`.
- `learnSkill` / `knowsSkill`.

The engine main loop is gone: `Engine.run()` just yields from `runFn(ctx)`, where `runFn` is the resolved preset run function.

## The Module interface

```ts
interface Module {
  id: string;
  version: string;
  initialize?(ctx): void;
  actionHandlers?: Record<string, ActionHandler>;
  triggers?: Trigger[];

  // 15 lifecycle hooks — see below.
  onSessionStart?(ctx): void;
  onScriptStart?(ctx, scriptId): void;
  onScriptComplete?(ctx, scriptId): void;
  onBeatEnter?(ctx, beat): BeatOverride | void;
  onChoicePresented?(ctx, choices): Choice[] | void;
  onChoiceSelected?(ctx, choice): void;
  onActionDispatch?(ctx, action): "cancel" | void;
  onActionComplete?(ctx, action, result): void;
  onStateMutated?(ctx, delta, source): void;
  onHubBuild?(ctx): HubOutput | void;
  onTriggerFire?(ctx, trigger): void;
  onEndConditionFire?(ctx, end): void;
  onError?(ctx, err): void;
  onSave?(ctx): Record<string, unknown> | void;
  onLoad?(ctx, snapshot): void;
}
```

### Compose strategies

Hooks compose differently depending on what they're for:

- **Notify-all** (most hooks): every module that defines the hook gets called. No return value.
- **First-wins** (`onHubBuild`, `onBeatEnter`, `onChoicePresented`): modules are polled in order; the first to return a non-`void` value wins, but the rest of the modules are still notified for observation purposes (e.g. analytics / debug modules can watch hub builds without claiming them).
- **Veto** (`onActionDispatch`): any module returning `"cancel"` short-circuits dispatch.

### ActionHandlers (the atomic invariant)

```ts
type ActionHandler = (ctx, action, payload?) => ActionResult;

interface ActionResult {
  deltas?: StateDelta;          // applied once, atomically
  narrations?: string[];        // pushed onto runtime.pendingNarrations
  scriptStart?: string;         // sets baseline.currentScriptId
}
```

Hard rule: **handlers do not yield**. They compute an `ActionResult` and return. The preset loop applies it via `applyActionResult` and drains narrations on subsequent steps. This is what lets `step` mode rebuild engines cheaply.

If a handler needs multi-step output (a combat with three lines of flavor text), it queues all the narrations at once into `result.narrations`. The main loop's `drainNarrations` releases them one per step.

## Reactive triggers

```ts
interface Trigger {
  id: string;
  when: Condition;
  do: (ctx) => TriggerEffect;
  once?: boolean;
}
```

Triggers are evaluated by `checkTriggers(ctx)`, which is called by `mutateState` after every state delta. They use **rising-edge detection**: a trigger fires when its `when` transitions false→true. `state.runtime.activeTriggers` records which triggers were true on the last check; `state.runtime.firedTriggers` records ones with `once: true` that already fired.

Cascade is bounded: `checkTriggers` runs until no new trigger fires in a pass (or hits a safety cap). A trigger's `do` returns `{ deltas?, narrations?, output? }`; deltas go through `mutateState` (which re-evaluates triggers — hence the cascade).

This is what lets games declare "when sword_power reaches 10, learn purify" without polling every frame.

## Condition DSL

Conditions are declarative trees, not embedded code — statically validatable, AI-author-friendly, never `eval`-ed.

```yaml
requires:
  all:
    - scriptCompleted: "001_meeting"
    - affection: { character: alice, min: 3 }
    - inventory: { itemId: talisman, min: 1 }
    - weaponPower: { weaponId: yaodao, gte: 10 }
    - knowsSkill: purify
    - stat: { name: spectral, lt: 50 }
```

Full grammar lives in `packages/engine/src/types.ts` (the `Condition` union) and `packages/engine/src/condition.ts` (the evaluator). Parser-side mirror in `packages/parser/src/condition.ts`.

## State model

State is plain JSON. No class instances, no functions, no `Date`s, no `Map`s. Survives `JSON.stringify` round-trip without loss.

```ts
interface GameState {
  baseline: {
    characters: Record<string, { affection: number; custom: Record<string, unknown> }>;
    flags: Record<string, unknown>;
    completedScripts: string[];
    currentScriptId: string | null;
    beatIndex: number;
    inventory: Record<string, number>;
    weapons: Record<string, { power: number }>;
    equippedWeaponId: string | null;
    knownSkills: string[];
  };
  training?: {
    day: number;
    slot: number;
    stats: Record<string, number>;
    statMax: Record<string, number>;
  };
  runtime: {
    pendingNarrations: string[];
    activeTriggers: string[];
    firedTriggers: string[];
  };
  // Module-private namespaces, keyed by module id:
  [moduleId: string]: unknown;
}
```

Saves are a single JSON file. AI playtester branching = snapshot + replay from a state. `git diff` on saves works. Hot-reload preserves state.

## Preset layer

Two bundled presets:

- **vn** (`packages/engine/src/presets/vn/`) — linear visual novel: walk scripts, accept inputs, end.
- **training** (`packages/engine/src/presets/training/`) — calendar + day/slot + stats + hub + actions + scripts + end conditions. Used by `spectral-demo`.

A game picks its preset in `game.yaml`:

```yaml
preset: training            # bundled by name
# or
preset: ./preset/run.ts     # ejected: ship your own run.ts
```

### Ejection

`autogal init --preset training --eject` copies the bundled training preset (`run.ts`, `module.ts`, `hub.ts`, `sleepHandler.ts`, `index.ts`) into the game's `preset/` directory and rewrites imports to depend only on `@autogal/engine`'s public surface. After ejection, authors can edit the loop without touching engine source.

`spectral-demo` ships ejected — its `preset/run.ts` adds a daybreak narration at the start of each new day's morning slot. Pure cosmetic; demonstrates the surface is real.

## Game folder layout

```
my-game/
  game.yaml              # title, preset, modules, training config, endings
  characters/*.md
  items/*.md
  enemies/*.md
  weapons/*.md
  skills/*.md
  scripts/*.md           # one beat-list per file
  actions/*.yaml         # hub-bound activities
  modules/*.ts           # optional: custom mechanics
  preset/*.ts            # optional: ejected loop
  tests/*.yaml           # optional: headless fixtures
```

The loader (`packages/cli/src/loader.ts`) scans each directory, dispatches to the matching parser, and assembles a `Game` object that goes into `new Engine(game)`.

## Test fixtures

`*.yaml` fixtures under `tests/` declare seed state + input sequence + assertions. The fixture runner (`packages/cli/src/test.ts`) drives the engine in `runLoop` mode and asserts on final state slots / output stream.

```yaml
name: "..."
state:
  baseline: { ... }
  training: { ... }
inputs:
  - { type: doActivity, id: "action:hunt" }
  - { type: next }
assertions:
  - { kind: state, path: baseline.weapons.yaodao.power, gte: 25 }
  - { kind: output, type: gameEnd, present: true }
```

Used as regression tests (CI runs all of them on every PR) and as executable spec for what a feature does end-to-end.

## What the engine does NOT know

- What "good ending" or "bad ending" means semantically.
- What "spectral" or "physical" represents (any stat is a number with a max).
- What "battle" or "hunt" is — modules define those via action handlers.
- How to render anything — frontend's job.
- Where save files live — host's job.
- Whether the player is human or LLM — both look identical from inside the loop.

Keeping the engine ignorant of all of this is what lets games swap mechanics without forking the engine.

## TypeScript

The contract is strict TS: no `any`, no `as` casts unless unavoidable. Every Claude Code user already has Bun, the user base is React-fluent, and "AI writes / human reviews" both want types.

## Why no comments in source

Code is short, names are explicit, types document intent. Comments document WHY only when the WHY would surprise a future reader. Everything else goes here in `docs/`.
