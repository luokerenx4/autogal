# Working on autogal

This file is for AI co-authors (Claude Code, Cursor, …) picking up this codebase. For human-facing architectural context, read `docs/ARCHITECTURE.md` first — it gives you the layering, the resource database, and the lifecycle hooks. This file is operational: where things live, what the hard rules are, how to extend without breaking.

## What this project is

A shell-native, headless-RPGMaker-shaped GalGame engine. A game is a folder. The engine runs in a terminal via ink; the same engine drives a web frontend and a JSON-in/JSON-out test harness.

Three packages, never cross-import internals:

- `@autogal/engine` — pure state machine. No React, no DOM, no Node-specific APIs (no `fs`, no `process`). Pure data in, pure events out. Owns the standard resource schemas (characters / items / enemies / weapons / skills), the Condition DSL, StateDelta, the Module interface (action handlers + 15 lifecycle hooks + reactive triggers), and the primitives that compose into preset loops.
- `@autogal/parser` — markdown + YAML frontmatter → Game AST. One file per resource type.
- `@autogal/cli` — terminal frontend (ink) + loader + test harness + `init --eject`.

## Hard rules

1. **Engine never imports DOM, Node, or React.** Any external need (read a file, ask the user) goes through an injected interface (`PresetContext`, frontend), never direct.
2. **State is plain JSON-serializable.** No class instances, no functions, no `Date`s, no `Map`s. `JSON.stringify` must round-trip without loss.
3. **One write path: `mutateState`.** Anything that changes `state.baseline` / `state.training` goes through `mutateState(ctx, delta, source)`. It calls `applyDelta` + `fireOnStateMutated` + `checkTriggers`. Bypassing it breaks triggers and the audit trail.
4. **ActionHandlers resolve atomically.** A handler returns an `ActionResult` (deltas + narrations + scriptStart). It does NOT yield. Multi-step output goes through `narrations: string[]` which the main loop drains one per step. This is what makes `step` mode work; violating it silently breaks AI playtester evaluation.
5. **Engine owns standard schemas; modules consume them.** Adding a field to `ItemDef` is an engine PR. A module's own data lives under `state[moduleId]` — its private namespace. Modules MUST NOT modify engine-owned slots except via primitives.
6. **No `any`, no `as` casts unless unavoidable.** Strict TS is the contract.
7. **No comments in source code.** Names and types must document themselves. Add a comment only when the WHY would surprise a future reader. Architecture docs go in `docs/`.
8. **Frontmatter is the only place imperative-looking syntax lives in content.** Scripts are declarative.

## Documentation sediment

Engine/parser/schema changes outrun docs by default — readers and future AI co-authors then work from stale information. When a PR changes behavior or shape, the docs update ships in the **same** PR, not as follow-up. Checklist:

1. **Engine schema** (new field on a `Def`, new `StateDelta` slot, new `Output` / `Input` variant, new `Condition` operator) → update `docs/ARCHITECTURE.md` resource table / relevant section.
2. **New frontmatter convention** (new fields in an asset format, new beat syntax, new effect shape) → update `.claude/skills/autogal-author/SKILL.md` so AI authors discover it.
3. **New game-mode shape** (a fundamentally different preset / hub pattern, like sengoku-raid's raid-as-mode) → add `examples/<game>/README.md` AND extend the "game modes" section of top-level `README.md`.
4. **New hard rule or repeating pattern** (something other modules should copy, like the `.custom` field passthrough) → add to this file's "Hard rules" or "Common tasks".
5. Run the full fixture suite (`bun run autogal test examples/<each>`) and typecheck for every package before opening the PR.

Precedents to imitate: commit `cd02df8` ("docs: sediment architecture + co-author docs to reflect post-PR-#7 reality") updated three docs in one go after PR #7. PR #12 (sengoku-raid + custom field + dispatcher hygiene) was the exception this checklist exists to prevent.

## File map

```
packages/engine/src/
  types.ts              all engine types (resources, state, Module, hooks, Output/Input, …)
  state.ts              createInitialState, applyDelta, query helpers
  condition.ts          Condition DSL evaluator
  engine.ts             Engine class — constructs maps, resolves runFn, exposes run()
  runLoop.ts            interactive `runLoop` driver
  step.ts               headless `step` driver (fresh engine per call)
  primitives/
    runScript.ts        beat loop with choice + effects
    drainNarrations.ts  empty runtime.pendingNarrations as outputs
    dispatchActivity.ts script-or-action routing
    applyActionResult.ts apply handler result atomically
    mutateState.ts      THE write path — delta + onStateMutated + checkTriggers
    checkEndConditions.ts
    checkTriggers.ts    rising-edge detection + bounded cascade
    hooks.ts            15 fireOn* dispatchers
    inventory.ts        give / consume / has
    weapons.ts          equip / getPower / setPower
    skills.ts           learn / knows
    index.ts            primitive re-exports
  modules/
    baseline.ts         bundled module: state init + useItem + useSkill handlers
    runtime.ts          bundled module: pendingNarrations init etc.
  presets/
    vn/                 visual-novel preset (linear)
    training/           calendar + hub + actions + endings preset
  index.ts              public exports

packages/parser/src/
  index.ts              buildGame(...) — assembles parsed pieces into a Game
  game.ts               game.yaml parsing
  script.ts             script .md parsing
  character.ts items.ts enemy.ts weapon.ts skill.ts action.ts
  condition.ts          Condition DSL parser (mirror of evaluator)
  inline-effects.ts     effects: blocks inside scripts / actions

packages/cli/src/
  index.ts              `autogal` binary entry — argv routing
  loader.ts             game-folder → Game (calls parsers, dynamic-imports modules + preset)
  app.tsx               ink root component
  interactor.ts         ink events → engine Input
  init.ts               `autogal init --preset --eject`
  test.ts               fixture runner
  autoplay.ts           persona-driven headless playthrough
  components/           ink widgets

examples/
  starter/              tiniest end-to-end (vn preset)
  hook-test/            hook integration smoke test (notify-all + first-wins + veto + triggers)
  eject-test/           ejection smoke test (just verifies an ejected preset still runs)
  spectral-demo/        full game: training preset, ejected, all 5 typed resources, custom combat module
  sengoku-raid/         extraction-shooter: raid-as-preset-mode, prefix-routed dispatch, maps/*.yaml,
                        per-character affection bond + skill unlocks, no training: block
```

## How a step happens

1. Frontend (or test harness) calls `loop.next(input)`.
2. The preset's `run.ts` resumes inside its `while (true)`.
3. It checks end conditions, drains queued narrations, advances scripts, polls hub via `fireOnHubBuild`, dispatches actions via `dispatchActivity`.
4. `dispatchActivity` resolves to either a script start (sets `currentScriptId`) or an action handler call (`ActionResult` → `applyActionResult` → `mutateState` per delta → triggers possibly cascade).
5. Generator yields the next `Output` and pauses, waiting for the next `Input`.

The engine itself (`engine.ts`) is ~100 lines. It builds maps, resolves the run function (game-specified path → bundled preset name → auto-pick by shape), and yields from `runFn(ctx)`.

## Common tasks

### Add a new typed resource to the engine

Follow the pattern established by `Item` / `Enemy` / `Weapon` / `Skill`:

1. **`packages/engine/src/types.ts`** — add `XxxDef`, a `Game.xxxs?: XxxDef[]` field, a `PresetContext.xxxMap`, a state slot under `BaselineState`, a `StateDelta.xxxs?` field if mutable, a `Condition` variant for queries, a `StateMutationSource` value if it has its own write source.
2. **`packages/engine/src/state.ts`** — initialize the baseline slot in `createBaselineState`; handle the slot in `applyDelta` (clamp / prune invariants live HERE, not in handlers).
3. **`packages/engine/src/condition.ts`** — add case for the new operator.
4. **`packages/engine/src/primitives/<resource>.ts`** — read/write helpers, all going through `mutateState` for writes.
5. **`packages/engine/src/modules/baseline.ts`** — if it has a bundled action handler (like `useItem`), register it here. Atomic-resolution invariant applies.
6. **`packages/engine/src/engine.ts`** — build the map in the constructor.
7. **`packages/engine/src/index.ts`** — export `XxxDef` and any new primitives.
8. **`packages/parser/src/<resource>.ts`** — mirror `character.ts`.
9. **`packages/parser/src/condition.ts`** — parse the new condition variant.
10. **`packages/parser/src/inline-effects.ts`** + **`script.ts`** + **`action.ts`** — accept the new StateDelta field.
11. **`packages/parser/src/index.ts`** — extend `buildGame` signature.
12. **`packages/cli/src/loader.ts`** — scan the new directory.
13. **`examples/spectral-demo/`** — add demo content + at least one fixture exercising the read AND write paths.
14. **`.claude/skills/autogal-author/SKILL.md`** — document the file format for AI authors.

Recent precedents: read the diffs for commits `cb7b9f3` (items), `0220799` (enemies), `6470ff8` (weapons), `c2efdb5` (skills). They're the template.

### Game-specific metadata on resource Defs (the `.custom` field)

Every parsed Def (`ItemDef` / `EnemyDef` / `WeaponDef` / `SkillDef` / `CharacterDef`) carries an optional `custom?: Record<string, unknown>` populated by `extractCustom()` in `packages/parser/src/frontmatter.ts` — any frontmatter key not in the parser's known-fields list lands there verbatim. Game modules read e.g. `enemy.custom.attack_power` or `item.custom.sell_value` straight from the engine's resource registry.

This is the preferred way to attach per-game data to a resource. **Do not** add fields to the engine `Def` interfaces just because one game needs them; that bloats the schema for every other game. Engine-side fields are for things every game needs (id, name, hp, etc.). `custom` is for everything else.

Originally needed because sengoku-raid was maintaining a `SELL_VALUES: Record<string, number>` workaround table in its module — the engine schema dropped the field and the module had to mirror it. After PR #12 the workaround is gone; the item .md is the single source of truth.

### Add a new Output type

1. Add variant to `Output` in `packages/engine/src/types.ts`.
2. Make the engine yield it where appropriate (usually inside a primitive).
3. Add a renderer component in `packages/cli/src/components/`.
4. Wire it into `packages/cli/src/app.tsx`.

Both ends MUST be updated. If you only add the type without rendering, the CLI fails at runtime on that variant.

### Add a new Input type

Symmetric: add variant, make the relevant primitive accept it, make the interactor produce it.

### Add a new Beat type

1. Add variant to `Beat` in `types.ts`.
2. Handle it in `primitives/runScript.ts` (the switch over `beat.type`).
3. Teach `packages/parser/src/script.ts` to recognize its syntax.

### Add a new Condition operator

1. Add variant to `Condition` in `types.ts`.
2. Handle it in `evaluateCondition` in `condition.ts`.
3. Add parse branch in `packages/parser/src/condition.ts`.

### Add a new lifecycle hook

1. Add the method to `Module` in `types.ts`.
2. Add `fireOnXxx` to `primitives/hooks.ts` — match an existing compose strategy (notify-all / first-wins / veto).
3. Call `fireOnXxx` at the right point in preset `run.ts` files AND/OR in primitives.
4. Add an entry to `examples/hook-test/` proving it fires.

### Write a module (game-side)

A gameplay module is a `.ts` file under the game's `modules/`. Default-export a `Module`. `id` should be unique. Use the module's id as the key for its private state namespace (`state[id]`). Reach into engine state ONLY via primitives (`giveItem`, `mutateState`, etc.) — never write `state.baseline.*` directly.

See `examples/spectral-demo/modules/combat.ts` for the canonical pattern: action handler for `kind: combat`, a reactive trigger (`learn_purify`), private log in `state["spectral-combat"]`.

### Add a fixture

`examples/<game>/tests/<name>.yaml` with the schema from `packages/cli/src/test.ts`. Fixtures run in CI on every PR. They're also executable spec — the assertions describe what the feature does.

## Testing

`bun test` runs the in-tree unit tests. `bun run autogal test <game-folder>` runs all `tests/*.yaml` fixtures. CI runs both for `starter`, `hook-test`, `eject-test`, and `spectral-demo` on every PR.

The engine is testable without ink: instantiate `new Engine(game)`, push synthetic inputs, assert on yielded outputs. Fixture infrastructure does exactly that.

## When NOT to touch the engine

The engine is small on purpose. If a feature can live in content (a new script, a new condition tree, a new flag), in a module (a new action handler, a new trigger), or in the frontend (better rendering, a different layout), do it there. Engine changes affect every game in existence.

Engine PRs are warranted for: new standard resource types, new hook points, new primitives that multiple modules will share, new `StateDelta` fields, new `Condition` operators, new `Output` / `Input` variants.

## Deferred / not yet implemented

- **States** (buff/debuff as a 5th typed resource) — tick mechanic + duration semantics are non-trivial; deferred until a game needs them.
- **Save/load surface** — state model supports it (plain JSON), but no CLI command yet.
- **Web frontend** — engine is ready; React DOM renderer is not built.
