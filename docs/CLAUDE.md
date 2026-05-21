# Working on autogal

This file is for AI co-authors (Claude Code, Cursor, etc.) working on this codebase or on a game built with this engine.

## What this project is

A shell-native GalGame engine. A game is a folder. The engine runs in a terminal via ink. Same engine can later render to web via React DOM.

Three packages, never cross-import internals:

- `@autogal/engine` — pure state machine. No React, no DOM, no Node-specific APIs (no `fs`, no `process`). Pure data in, pure events out.
- `@autogal/parser` — markdown + frontmatter → Script AST.
- `@autogal/cli` — terminal frontend using ink.

## Hard rules

1. **Engine never imports DOM, Node, or React.** If it needs to read a file or talk to the user, it does so through an injected interface, never directly.
2. **State is plain JSON-serializable.** No class instances, no functions, no Date objects, no Maps. Plain records and arrays.
3. **No comments in source code.** Names and types must document themselves. Add a comment only when the WHY would surprise a future reader. Docs go in `docs/`.
4. **No `any`, no `as` casts unless unavoidable.** Strict TS is the contract.
5. **Frontmatter is the only place imperative-looking syntax lives in content.** Scripts are declarative.

## File map

```
packages/engine/src/
  types.ts        all engine types (Output, Input, Beat, Script, etc.)
  condition.ts    Condition DSL evaluator
  state.ts        state initialization, delta application, query helpers
  engine.ts       the AsyncGenerator main loop
  index.ts        public exports

packages/cli/src/
  index.ts        the `autogal` binary entry
  app.tsx         the ink root component
  interactor.ts   bridges ink user events to engine input
  components/     small ink widgets (Dialogue, Choices, etc.)

examples/starter/
  play.ts         constructs a Game in code, runs it via cli
```

## Common tasks

### Add a new Output type

When the engine needs to communicate a new kind of event to the frontend:

1. Add the variant to `Output` in `packages/engine/src/types.ts`.
2. Make the engine yield it where appropriate.
3. Add a renderer component in `packages/cli/src/components/`.
4. Wire it into `packages/cli/src/app.tsx`.

Both ends MUST be updated. If you only add the type without rendering, the CLI will fail at runtime on that variant.

### Add a new Input type

Symmetric: add the variant, make the engine accept it in the relevant beat handler, make the interactor able to produce it.

### Add a new Beat type (a new kind of thing a script can contain)

1. Add the variant to `Beat` in `types.ts`.
2. Handle it in `engine.runScript` (the switch over `beat.type`).
3. Eventually: teach the parser to recognize its syntax (when the parser exists).

### Add a new Condition operator

1. Add the variant to `Condition` in `types.ts`.
2. Handle it in `evaluateCondition` in `condition.ts`.
3. Update the parser when adding parsable forms.

## Testing

(Not wired yet.) Tests live next to source as `*.test.ts`. Run with `bun test`. The engine should be testable without ink — instantiate it, push synthetic inputs, assert on yielded outputs.

## When NOT to touch the engine

The engine is small. If a feature can be done in content (a new script, a new condition tree, a new flag) or in the frontend (better rendering, a different layout), do it there. Engine changes affect every game.
