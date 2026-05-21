# Architecture

## Three-layer separation

The hard rule of this project: **Engine, Content, and Interactor are three independent layers that never know about each other's internals.**

```
┌──────────────────────────────────────────────┐
│  Interactor                                   │
│  How the human (or AI) sees and reacts.       │
│  - TerminalInteractor (ink)                   │
│  - WebInteractor (React DOM, next)            │
│  - AIInteractor (LLM-driven, next)            │
│  - HeadlessInteractor (JSON in/out, tests)    │
└──────────────────────┬───────────────────────┘
                       │ Output / Input via AsyncGenerator
┌──────────────────────┴───────────────────────┐
│  Engine                                       │
│  Pure state machine. Genre-agnostic.          │
│  Yields semantic events, accepts inputs.      │
│  Does not import DOM, Node fs, or React.      │
└──────────────────────┬───────────────────────┘
                       │ uses
┌──────────────────────┴───────────────────────┐
│  Content                                      │
│  Game-as-folder. Scripts, characters,         │
│  manifest. Markdown + frontmatter (planned).  │
└──────────────────────────────────────────────┘
```

Same Engine + same Content + different Interactor = same game, different frontend.
Same Engine + different Content + same Interactor = different game, same frontend.

## Engine main loop

The Engine is an `AsyncGenerator<Output, void, Input>`. It yields semantic events (a dialogue line, a choice prompt) and receives semantic inputs (advance, pick option N).

It is NOT a render loop. It does not know whether the output ends up in a terminal, a browser, or a JSON stream. That is the Interactor's job.

```typescript
const engine = new Engine(game);
const loop = engine.run();
let input: Input = { type: "next" };
while (true) {
  const { value: output, done } = await loop.next(input);
  if (done) break;
  await interactor.render(output);
  input = await interactor.read(output);
}
```

## State model

State is a plain serializable object. No class instances inside state. No functions inside state. Anything in state can be `JSON.stringify`-ed and survives round-trip without loss.

This unlocks:
- Save / load via a single JSON file.
- AI playtester branching (snapshot, replay from arbitrary point).
- `git diff` on save files for debugging.
- Hot-reload without losing state.

State shape:
```typescript
{
  characters: { alice: { affection: 3, custom: {} }, ... },
  flags: { has_umbrella: true, ... },
  completedScripts: [ "001_meeting" ],
  currentScriptId: "002_picnic",
  beatIndex: 7
}
```

## Condition DSL

Conditions are declarative trees, not embedded code. This means:
- They can be statically validated.
- AI co-authors can be taught a small surface.
- The engine never `eval`s anything.

```yaml
requires:
  all:
    - scriptCompleted: "001_meeting"
    - affection: { character: alice, min: 3 }
    - flag: { name: has_umbrella, eq: true }
```

## What the Engine does NOT know

- What "good ending" or "bad ending" means.
- What "affection" semantically represents.
- How to render a dialogue line.
- Where save files live on disk.
- Whether the player is a human or an LLM.

All of these belong elsewhere — to content (semantics), interactor (rendering), or host (storage). Keeping the engine ignorant of them is what lets it stay small and stay community-modifiable.

## Plugin hooks (planned)

The Engine will expose lifecycle hooks for community extensions:
- `beforeScriptEnter`, `afterScriptEnter`
- `beforeChoice`, `afterChoice`
- `beforeStateChange`, `afterStateChange`
- `beforeBeat`, `afterBeat`

Plugins are registered at Engine construction. They cannot reach into Engine internals — they receive structured events and may return modified versions of structured events.

## Content format (planned: Markdown + frontmatter)

A game is a directory:

```
my-game/
  game.yaml              manifest: title, initial script, custom quality schema
  characters/
    alice.md             character def (frontmatter + free text)
  scripts/
    001_meeting.md       台本 1
    002_picnic.md        台本 2
```

A script in markdown will look approximately like:

```markdown
---
id: 001_meeting
title: 初次相遇
requires: ~
characters: [alice]
---

@alice 你好，我是 Alice。

(narration text without speaker)

? 你怎么回应？
- 微笑点头
    effects: { affection: { alice: +1 } }
- 装作没听见
    effects: { affection: { alice: -1 } }
- 大方介绍自己
    requires: { flag: { name: confidence, min: 2 } }
    effects: { affection: { alice: +2 }, flags: { confidence: +1 } }

@alice 真有趣呢。
```

The parser turns this into an array of `Beat` objects. Authors never see `Beat` directly; they write markdown.

## Why TypeScript

See `docs/CLAUDE.md` and the project README for the rationale. Short version: every Claude Code user already has the runtime; the user base is React-fluent; "AI writes" and "human reviews" both want TS here.

## Why no comments in source

Code is short, names are explicit, types document intent. Comments document WHY only when the WHY would surprise a future reader. Everything else goes in docs.
