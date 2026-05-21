---
name: autogal-author
description: Author content for an autogal GalGame — write or extend scripts (台本), add characters, design branching, add tests. Use this skill when you're inside an autogal game folder (one with game.yaml + characters/ + scripts/) and the user wants you to write story content, add a new scene, design an ending, balance affection numbers, or add a test fixture.
---

# autogal-author

You're writing content for an autogal game. You don't write engine code — you only edit markdown and YAML files inside the game directory.

## Where you are

You should be in a folder that has:
- `game.yaml` — manifest
- `characters/` — one .md file per character
- `scripts/` — one .md file per 台本 (story segment)
- `tests/` (optional) — fixture-based regression tests

If any of those is missing, the user is starting from scratch — suggest `autogal init` to scaffold a template.

## The script (.md) format

Every script is a markdown file with frontmatter. The frontmatter declares metadata; the body is the actual story. Beats are separated by blank lines.

```markdown
---
id: 001_meeting          # unique within the game
title: 樱花树下           # human-readable
characters: [alice]      # which characters appear
requires:                # optional — when this script becomes available
  affection: { character: alice, min: 1 }
---

narration line.          # plain text is narration

@alice 嗨。               # @<id> <text> is dialogue from character <id>

? 你怎么回应？             # ? at start = choice block
- 打招呼 -> +alice         # inline: "<text> -> <effects>"
- 离开 -> -alice
- 转身 -> goto leave       # goto a label (or `goto $end` to end script here)

她笑了。

[end]                     # explicit end-of-script (skip remaining beats)

# leave                   # label (jump target)

你转身离开了。
```

### Beat types in detail

**Narration** — plain text, no prefix:
```
她合上素描本，但没收起来。
```

**Dialogue** — `@<character-id>` at start of paragraph:
```
@alice 我点了两杯咖啡。
```
The character must be defined in `characters/<id>.md`. The display name comes from the character file's `name` frontmatter field.

**Choice** — `?` at start, then `-` options. Inline effects after `->`:
```
? 你怎么说？
- "嗯，谢谢" -> +alice
- "不喝咖啡" -> -alice
- "你点什么我喝什么" -> +2alice
```

Inline effects support **only** affection deltas: `+alice` (= +1 to alice), `-bea` (= -1 to bea), `+2alice` (= +2 to alice). For anything more complex (flags, requires on options, goto), use a YAML fenced block (see below).

You can also add `goto <label>` after `|`:
```
- 走开 -> -alice | goto leave
- 留下 -> +alice
```

**Label** — `# <name>` on its own line. Used as a goto target:
```
# leave
```

Label names: ASCII letters/digits/underscore/hyphen. Cannot start with `$` (reserved).

**End-of-script** — `[end]` on its own line. Stops the script immediately. Use this to prevent fall-through into following label sections.

**YAML fenced choice** — when you need flags, requires on options, or multi-effect:

````markdown
```yaml
type: choice
prompt: 你要选哪条路？
options:
  - text: 跟 alice 走
    effects:
      flags: { route: alice }
      affection: { alice: 1 }
    goto: pick_alice
  - text: 跟 bea 走
    requires:
      affection: { character: bea, min: 2 }
    effects:
      flags: { route: bea }
    goto: pick_bea
```
````

## Frontmatter `requires` — the Condition DSL

When a script (or fenced choice option) has `requires`, it's only available when the condition is true. The grammar:

```yaml
# Atoms:
scriptCompleted: 001_meeting               # this script must be in completedScripts
affection: { character: alice, min: 2 }   # alice's affection >= 2
affection: { character: bea, max: 5 }     # bea <= 5
affection: { character: alice, eq: 0 }    # alice == 0
flag: { name: route, eq: alice }          # flags.route === "alice"
flag: { name: coins, min: 100 }           # flags.coins >= 100 (numeric flags only)
stat: { name: spectral, min: 80 }         # training-mode stat >= 80
inventory: { itemId: talisman, min: 1 }   # player holds >= 1 talisman
weaponPower: { weaponId: yaodao, min: 20 } # equipped/registered weapon's power >= 20
knowsSkill: purify                         # player has learned the skill
day: { min: 8 }                           # training calendar
slot: { eq: 2 }                           # training-mode slot index

# Combinators:
all: [<cond>, <cond>, ...]                # all must hold (AND)
any: [<cond>, <cond>, ...]                # any holds (OR)
not: <cond>                                # negation

# Example: both alice+bea high but no specific route picked yet
requires:
  all:
    - affection: { character: alice, min: 3 }
    - affection: { character: bea, min: 3 }
    - not:
        flag: { name: route, eq: alice }
```

## Character file format

```markdown
---
id: alice
name: 薄樱
defaultAffection: 0
---

短描述。用于作者参考，引擎不读。
```

The `id` must match what scripts use in `@<id>` dialogue beats.

## Item file format — `items/<id>.md`

Optional directory. Items are engine-level resources; once declared,
the player can carry them in `state.baseline.inventory` and you can
gate scripts/actions on them via `requires: { inventory: ... }`.

```markdown
---
id: talisman
name: 镇魂札
kind: consumable        # consumable | key | gift
stack: true             # optional; default true. false = unique key item
effects:                # optional; applied when player uses the item
  stats: { spectral: -10 }
---

Markdown body becomes the item's description (for hub UI / AI context).
```

To let the player **acquire** an item, put `inventory: { talisman: 1 }`
in any action's or beat's `effects`:

```yaml
# actions/find_talisman.yaml
id: find_talisman
title: 翻一张札
effects:
  inventory: { talisman: 1 }
```

To let the player **use** an item, declare an action with
`kind: useItem` and `itemId: <id>`. The engine's bundled handler
consumes one of the item AND applies the item's `effects` atomically:

```yaml
# actions/use_talisman.yaml
id: use_talisman
title: 撕一张镇魂札
kind: useItem
itemId: talisman
requires:
  inventory: { itemId: talisman, min: 1 }   # only show when player has one
```

The engine deletes the inventory key when its count hits zero — you
don't need to clean up explicitly. Counts never go below zero.

## Enemy file format — `enemies/<id>.md`

Optional directory. Enemies are engine-level data; combat modules
(e.g. spectral-combat) read enemy stats + narrations and apply their
own damage formulas.

```markdown
---
id: youkai
name: 妖怪
hp: 6                   # base HP. Combat module may scale (e.g. +day×k).
stats:                  # optional; combat module decides how to use
  attack: 2
narrations:             # optional; templates with {hp} {name} {damage}
  intro: 一团扭曲的影子爬出——HP {hp} 的{name}。
  victory: {name} 化为光点散去。
  escape: {name} 逃了。
---

Markdown body becomes the enemy's description (for hub UI / AI authoring).
```

Actions that fight an enemy declare it via `enemyId`:

```yaml
# actions/hunt.yaml
id: hunt
kind: combat
enemyId: youkai
requires:
  stat: { name: mental, min: 2 }
```

The engine **does not dispatch on `enemyId` itself** — it just makes
the enemy data available via `game.enemies` to whatever combat handler
the game registers. Combat modules are responsible for picking up the
enemy and using its fields.

## Weapon file format — `weapons/<id>.md`

Optional directory. Weapons are engine-level resources with a static
definition + a runtime mirror in `state.baseline.weapons[id]`. Engine
auto-equips the only declared weapon at init (single-weapon games);
multi-weapon games equip via the `equipWeapon` primitive.

```markdown
---
id: yaodao
name: 妖刀
basePower: 3         # state.baseline.weapons.yaodao.power starts here
kind: melee          # optional; combat modules may dispatch on this
properties:          # optional; open-ended fields combat modules use
  crit_scaling: 0.7
---

Markdown body becomes the weapon's description.
```

To **grow a weapon's power** during play, put `weapons` in any
action's or beat's `effects`:

```yaml
# actions/night_study.yaml — train the sword by study
effects:
  weapons: { yaodao: { power: 2 } }
  stats: { mental: -2 }
```

To **gate a script/action** on weapon power, use the `weaponPower`
condition variant:

```yaml
requires:
  weaponPower: { weaponId: yaodao, min: 20 }
```

Combat modules read the equipped weapon's current power via the
`getEquippedWeaponPower(ctx)` primitive (or
`state.baseline.weapons[state.baseline.equippedWeaponId].power` from
inside an ActionHandler).

## Skill file format — `skills/<id>.md`

Optional directory. Skills are learnable abilities — distinct from
actions in that they're owned (in `state.baseline.knownSkills`) and
gated by knowledge, not by stat thresholds. Engine ships a bundled
`useSkill` action handler.

```markdown
---
id: purify
name: 净化术式
cost:
  stats: { intellect: -3 }      # what the skill consumes
effects:
  stats: { spectral: -15, mental: -1 }   # what it does
requires:
  stat: { name: intellect, min: 5 }      # gate on usability (in addition to ownership)
---

Markdown body becomes the skill's description.
```

To **teach** the player a skill, put `skills: { learn: [...] }` in
any action's or beat's `effects`, OR — more interesting — declare a
reactive trigger in a game module that watches state and grants the
skill on milestones:

```ts
// modules/combat.ts
triggers: [
  {
    id: "learn_purify",
    when: { weaponPower: { weaponId: "yaodao", min: 10 } },
    once: true,
    do: () => ({ deltas: { skills: { learn: ["purify"] } } }),
  },
]
```

To **use** a skill, declare an action with `kind: useSkill` and
`skillId: <id>`. The engine's bundled handler validates ownership +
applies cost + effects in one combined atomic delta:

```yaml
# actions/use_purify.yaml
id: use_purify
title: 发动净化术式
kind: useSkill
skillId: purify
requires:
  all:
    - knowsSkill: purify
    - stat: { name: intellect, min: 3 }
```

## Script ID conventions (suggested, not enforced)

Numeric prefix groups related scripts:
- `001_*` — opening
- `00X_*` — main flow
- `004a_*`, `004b_*` — branch routes (a/b for parallel)
- `005a_good`, `005b_bad` — endings

Script availability is determined by `requires`, not by name. Names are for humans.

## Test fixtures — `tests/*.yaml`

For regression: assert that certain inputs lead to certain state.

```yaml
name: 选好感选项三次应该解锁 002
description: ...
state:                       # optional partial state to seed
  baseline:
    characters:
      alice: { affection: 3 }
inputs:
  - { type: select, scriptId: "001_meeting" }
  - { type: next }
  - { type: choose, index: 2 }
assertions:
  - { kind: reason, eq: completed }   # or inputs-exhausted / quit / max-steps
  - { kind: state, path: baseline.completedScripts, includes: 001_meeting }
  - { kind: state, path: baseline.characters.alice.affection, eq: 5 }
  - { kind: output, type: gameEnd, present: true }
```

After writing or changing scripts, run `autogal test .` to check fixtures still pass.

## How to make changes

1. **Understand the existing flow first.** Read `game.yaml`, all `characters/*.md`, all `scripts/*.md`. Note which scripts gate which (via `requires`). Build a mental map of the routes and endings.
2. **Identify what's being asked.** Is it: add a new branch? Polish dialogue? Balance affection thresholds? Add a new character?
3. **Make the change in the smallest viable scope.** One new script is better than three. Edit existing text in-place when polishing.
4. **Test.** Run `autogal autoplay . --persona greedy` and `--persona charmer` and `--persona rude`. Each should still reach a defined ending. Then `autogal test .` to verify fixtures.
5. **If a fixture is now wrong** (the design changed legitimately), update the fixture rather than the design — and tell the user what changed.

## When NOT to touch

- Don't edit `engine/`, `parser/`, `cli/` source — that's engine, not content.
- Don't touch `.autogal/sessions/` — those are player saves.
- Don't change a character's `id` once scripts reference it. Add a new character if you need a new name.
- Don't introduce a new beat type or condition operator the engine doesn't already support. (See the lists above.)

## Stylistic guidance

- Keep narration short and concrete. The player advances one beat at a time — long paragraphs feel like walls.
- Don't repeat what a character just said in narration. Dialogue carries voice; narration carries scene.
- 3 choice options is usually right. 2 feels coercive. 5+ feels like a survey.
- An ending script should be SHORT (3-6 beats). The drama is in the run-up; the ending lands the feeling.
- A "bad" ending isn't punishment — it's a different note. Even "bad" endings should give the player something to feel.

## Common pitfalls

- **Fall-through past `[end]` is forgotten** — if a script has a `# leave` section but no `[end]` before it, the main path will run into the leave content. Use `[end]`.
- **Label names with special chars** — only `[a-zA-Z_][\w-]*` works. `$end` is the reserved goto-to-end-of-script target.
- **Inline effects with flags** — inline only supports affection. For flags use YAML fence.
- **Forgetting to add `scriptCompleted` to ending requires** — if you have `004 → 005`, ending 005 should also require 004 completed, otherwise random play can skip ahead.
