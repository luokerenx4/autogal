# autogal

A shell-native GalGame engine.

A game is a folder of markdown files. You play it in your terminal — from a main menu, with save slots and an in-game pause menu. An AI can read the same game and play through it from the shell, by reading stdout and writing stdin, with no SDK required.

```bash
bun install
bun run play              # boot "樱花季" — minimal pure VN demo
bun run autoplay          # watch a built-in AI persona play through

# Or try the training-mode demo:
bun packages/cli/src/bin.ts play examples/spectral-demo
bun packages/cli/src/bin.ts autoplay examples/spectral-demo --persona greedy -v
```

## Make your own

```bash
bun packages/cli/src/bin.ts init ./my-game   # scaffold a minimal game
cd my-game
autogal play .                                # play it
```

Or in another terminal, **edit `scripts/001_intro.md` while the game is running** — the engine watches for `.md` / `.yaml` changes and reloads the next time a beat resolves. Live authoring with no restart.

## Let an AI play (or write)

Two skills ship with the repo:

- **[`autogal-player`](.claude/skills/autogal-player/SKILL.md)** — read this and an AI knows how to play autogal games by running `autogal peek` / `autogal step` in a shell loop. No SDK, no API key.
- **[`autogal-author`](.claude/skills/autogal-author/SKILL.md)** — read this and an AI knows how to extend an autogal game: new scripts, new characters, new branches, new tests. The full DSL is documented inline.

Drop into Claude Code inside any autogal game folder containing `.claude/skills/`:

```
> Read .claude/skills/autogal-player/SKILL.md and play through this game
> as a thoughtful character who's curious but doesn't oversell themselves.
```

or

```
> Read .claude/skills/autogal-author/SKILL.md, then add a third character
> named "凉" who shows up in script 003 as a wild card.
```

The AI discovers the format on its own. To enable this in a game folder created via `autogal init`, copy `.claude/` from the autogal repo into your game folder.

## What's in the box

```
autogal/
├── packages/
│   ├── engine/    Pure state-machine runtime. No DOM, no Node-specific APIs.
│   ├── parser/    Markdown + frontmatter + YAML fence → engine AST.
│   └── cli/       The `autogal` binary: init / play / step / peek / autoplay / test / sessions.
├── examples/
│   ├── starter/        "樱花季" — pure VN, 10 scripts, 2 chars, 5 endings (5–10 min)
│   ├── spectral-demo/  "妖刀さくら抄" — training-mode demo with day/time/stats/combat
│   │                   (10 scripts, 2 chars, 9 actions, 5 endings, ~14 in-game days)
│   └── sengoku-raid/   "妖刀奇譚" — extraction-shooter raid loop, 2 maps × 10 zones,
│                       2 美少女 妖刀使, boss + unlockable skills
└── .claude/skills/
    ├── autogal-player/SKILL.md   for AIs that play
    └── autogal-author/SKILL.md   for AIs that write content
```

## Three game modes

**Pure VN** (like `starter`): scripts only. Between scripts, the engine yields a
`scriptComplete` picker. Affection + flags + branching. Classic visual novel.

**Training mode** (like `spectral-demo`): add a `training:` block to `game.yaml`
and the hub becomes era-style. Day/time slots, stats with caps, an `actions/`
folder of daily activities, optional combat mini-loop with crit/fumble mechanics
tied to a `spectral` stat, end conditions that trigger ending scripts. Story
scripts coexist with daily actions as activities in the hub.

**Extraction-shooter** (like `sengoku-raid`): no `training:` block — instead, a
game module owns a `mode: "hub" | "raid"` flag and provides mode-appropriate hub
menus via `onHubBuild`. An ejected `preset/run.ts` routes activity prefixes
(`script:` / `action:` to the engine's dispatcher, `raid:` / `hub:` to the
module's). Raids are preset modes, not scripts — so they're naturally repeatable
and the engine's `completedScripts` never gets polluted. Set-piece scenes still
use scripts (intros, character first-meets, bonding beats); the random raid
content lives in module action handlers with `ctx.rng()`.

See `examples/spectral-demo/README.md` and `examples/sengoku-raid/README.md` for
the full designs.

## How a play session is structured

`autogal play <game-dir>` boots into a **Hub** where you pick what to do:

```
樱花季 / Cherry Blossom Season
autogal · shell-native GalGame

▸ 新游戏
  继续: play-20260521-143012    进行中 · 003_invitation · 2 完成
  继续: claude-thoughtful       ✓ 005c_bea_good
  退出

↑↓/jk 选择 · Enter 确认 · q 退出
```

- **新游戏** auto-creates a fresh session (named by timestamp).
- **继续: X** resumes that save (autosaves after every advance).
- **Esc** during play opens an in-game menu (Continue / Return to Hub / Quit).

Saves live at `<game-dir>/.autogal/sessions/<name>/state.json` — plain JSON, `git diff`-able, copyable between machines.

## The seven modes

```bash
autogal init     <dir> [--force]                                  # scaffold a new game
autogal play     <game-dir>                                       # interactive TUI (ink, hot-reloading)
autogal step     <game-dir> --input <json> [--session NAME]       # headless, stateless step
autogal peek     <game-dir> [--session NAME]                      # inspect current state
autogal autoplay <game-dir> --persona NAME [-v]                   # built-in AI plays through
autogal test     <game-dir>                                       # run fixtures
autogal sessions <game-dir>                                       # list save sessions
```

Every mode runs on the same engine and the same content. `step` and `play` produce
identical state files. `autoplay` is just `step` with a built-in persona deciding
the input. `test` is `step` with assertions on the resulting trace. An AI agent
playing via the `autogal-player` skill is just `step` with the LLM deciding the input.

## A game is a folder

```
my-game/
├── game.yaml                  title
├── characters/
│   └── alice.md               name, default affection, description
├── scripts/
│   ├── 001_meeting.md         台本 with frontmatter: id, title, requires, characters
│   └── ...
└── tests/
    └── good-ending.yaml       fixture: state seed + inputs + assertions
```

No `package.json`. No `node_modules`. No build step. Author writes markdown.

## Script syntax

Every paragraph is one **beat**. Empty lines separate beats.

```markdown
---
id: 001_meeting
title: 樱花树下
characters: [alice]
---

四月的午后，校园的樱花树下。           ← narration (plain text)

@alice 嗨。你也喜欢看樱花吗？          ← dialogue (@speaker prefix)

? 你怎么回应？                          ← choice (? prompt)
- "嗯，很美。" -> +alice               ← inline effect: alice affection +1
- "只是路过。" -> -alice
- "我喜欢看你画。" -> +2alice           ← +N for larger deltas
- 离开 -> goto leave                    ← goto a label

她笑了。

[end]                                    ← end script here (skip remaining beats)

# leave                                  ← label

你转身离开了。
```

For complex choices (requires, flags, multiple effects), use a YAML fenced block:

```markdown
​```yaml
type: choice
prompt: 你怎么选？
options:
  - text: 答应碧河
    effects:
      flags: { route: bea }
    goto: pick_bea
  - text: 跟薄樱走
    requires:
      affection: { character: alice, min: 2 }
    effects:
      flags: { route: alice }
    goto: pick_alice
​```
```

## Headless step API

This is what makes `autoplay`, `test`, and the AI-player skill possible:

```
step :: (Game, GameState, Input) → (GameState, Output)
```

Pure function. Stateless. Persistable. So:

```bash
# Session "claude" plays one step at a time
autogal step ./my-game --session claude --input '{"type":"select","scriptId":"001_meeting"}'
autogal step ./my-game --session claude --input '{"type":"next"}'
autogal step ./my-game --session claude --input '{"type":"choose","index":2}'
```

State persists to `<game-dir>/.autogal/sessions/<name>/state.json` between calls.
Each `step` also appends `(input, output)` to `log.jsonl` for replay.

## Test injection

```yaml
# tests/seeded-alice-good.yaml
name: 注入 alice 高好感，验证 good ending 可达
state:
  baseline:
    characters:
      alice: { affection: 5, custom: {} }
    flags: { route: alice }
    completedScripts: [001_meeting_alice, 002_meeting_bea, 003_invitation, 004a_alice_route]
inputs:
  - { type: select, scriptId: "005a_alice_good" }
  - { type: next }
  # ...
assertions:
  - kind: state
    path: baseline.completedScripts
    includes: 005a_alice_good
  - kind: output
    type: gameEnd
    present: true
```

You don't have to play through 001–004 to test 005a. Seed the state, run the loop,
assert the outcome. Same idea Auto-Quant uses for strategy backtesting, applied
here to gameplay regression.

## Built-in personas (no API key)

```bash
autogal autoplay ./examples/starter      --persona greedy    -v   # always pick first option
autogal autoplay ./examples/starter      --persona charmer   -v   # always pick last
autogal autoplay ./examples/starter      --persona rude      -v   # always pick index 1
autogal autoplay ./examples/starter      --persona random    -v   # uniform random
autogal autoplay ./examples/spectral-demo --persona hunter   -v   # training-mode-aware
autogal autoplay ./examples/sengoku-raid --persona extractor -v   # always extract / flee / sell
autogal autoplay ./examples/sengoku-raid --persona delver    -v   # always attack / push deepest
```

Each persona produces a deterministic-ish playthrough that lands on a specific
ending. `random` is for fuzz-testing path coverage. For LLM-driven personas use
the [`autogal-player` skill](.claude/skills/autogal-player/SKILL.md).

## Architecture in one paragraph

`Engine` is a pure state machine. State is namespaced (`{ baseline: { ... } }`)
so future modules (combat, training, etc.) can each own a slice. The engine
yields `Output` events through an `AsyncGenerator` and accepts `Input` decisions.
The same generator is wrapped as `step()` for headless, `runLoop()` for batch
(tests + autoplay), and `play()` for the ink TUI. Same engine, different I/O bindings.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the long version,
[`docs/CLAUDE.md`](docs/CLAUDE.md) if you're an AI co-authoring on this codebase,
and [`.claude/skills/autogal-player/SKILL.md`](.claude/skills/autogal-player/SKILL.md)
if you're an AI playing the games.

## Status

Pre-alpha. Works end-to-end. Hub-mode TUI with multi-save and live hot-reload,
markdown content authoring, headless step API, fixture testing, built-in autoplay
personas, AI player + author skills, and a scaffold command (`autogal init`) are
all landed. Combat/training modules, web frontend, and plugin registry are next.

## License

MIT.
