import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Args {
  dir: string;
  force: boolean;
  preset: string;
  eject: boolean;
}

interface ScaffoldFile {
  path: string;
  content: string;
}

interface PresetScaffold {
  name: string;
  files: ScaffoldFile[];
  dirs: string[];
}

// ============ shared (cross-preset) ============

const README = (gameLine: string): string => `# 我的 RPG-Harness 游戏

一个用 [RPG-Harness](https://github.com/luokerenx4/rpg-harness) —— headless RPG Maker —— 做的游戏。引擎只管通用的资产 + state machine + lifecycle hook；游戏特有的玩法逻辑你自己写 \`modules/*.ts\`（或 eject 后改 \`preset/run.ts\`）。纯叙事 GalGame 只用 markdown 也能跑。
${gameLine}

## 玩

\`\`\`bash
rpgh play .                          # 人玩（ink TUI）
rpgh autoplay . --persona greedy -v  # AI 玩
\`\`\`

## 写

游戏内容是 markdown / yaml；玩法逻辑是可选的 ts module：

- \`game.yaml\` — 标题、preset、可选 modules / training 配置
- \`characters/\` — 角色定义
- \`scripts/\` — 台本
- \`actions/\` — hub 上的动作（training 模式或自定义 module 用）
- \`items/\` \`enemies/\` \`weapons/\` \`skills/\` — 可选的引擎资产
- \`modules/\` — 可选的 ts module，写复杂玩法（action handler / trigger / lifecycle hook）
- \`preset/\` — 可选，\`rpgh init --eject\` 后落地的主循环
- \`tests/\` — 回归测试

## 测试

\`\`\`bash
rpgh test .
\`\`\`

## AI 协作

把 RPG-Harness 仓库的 \`.claude/skills/\` 拷过来；AI 自动知道怎么玩这个游戏（\`rpg-harness-player\` skill）和怎么帮你写新内容（\`rpg-harness-author\` skill）。
`;

const GITIGNORE = `# Player saves — local only
.rpg-harness/

node_modules
.DS_Store
*.log
`;

const CHARACTER_ALICE = `---
id: alice
name: Alice
defaultAffection: 0
---

故事的关键角色。这一段是给作者看的，引擎不读。
`;

// ============ vn preset scaffold ============

const VN_GAME_YAML = `title: 我的第一个 RPG-Harness 游戏
preset: vn
`;

const VN_SCRIPT = `---
id: 001_intro
title: 开场
characters: [alice]
---

天气很好。你站在一个十字路口。

@alice 嗨，你好。

? 你怎么回应？
- 礼貌地点头 -> +alice
- 不理她
- 主动介绍自己 -> +2alice

@alice 很高兴认识你。

[end]
`;

const VN_TEST = `name: 选"主动介绍自己" alice 应该 +2
description: 验证 inline effects 的 +2alice 语法生效
inputs:
  - { type: select, scriptId: "001_intro" }
  - { type: next }
  - { type: next }
  - { type: choose, index: 2 }
  - { type: next }
assertions:
  - kind: state
    path: baseline.characters.alice.affection
    eq: 2
  - kind: state
    path: baseline.scripts.001_intro.completed
    eq: true
`;

const VN_SCAFFOLD: PresetScaffold = {
  name: "vn",
  dirs: ["characters", "scripts", "tests"],
  files: [
    { path: "game.yaml", content: VN_GAME_YAML },
    { path: "characters/alice.md", content: CHARACTER_ALICE },
    { path: "scripts/001_intro.md", content: VN_SCRIPT },
    { path: "tests/intro-test.yaml", content: VN_TEST },
    { path: "README.md", content: README("\n这是一个 pure VN — 没有 hub、没有数值，只有剧情和分支。") },
    { path: ".gitignore", content: GITIGNORE },
  ],
};

// ============ training preset scaffold ============

const TRAINING_GAME_YAML = `title: 我的训练 mode 游戏
preset: training
training:
  slotsPerDay: 3
  slotNames: [morning, afternoon, night]
  startDay: 1
  maxDay: 7
  decayPerDay: 0
  decayStatId: ""
  sleepActionId: sleep
  huntActionId: ""
  stats:
    - { id: trust, name: 信任, min: 0, max: 100, start: 0 }
  endConditions:
    - reason: 信任拉满
      when: { stat: { name: trust, min: 50 } }
      goto: end_trust
`;

const TRAINING_SCRIPT_INTRO = `---
id: 001_intro
title: 开场
characters: [alice]
---

第一天。你刚转学过来。

@alice 我是 Alice。我们这有点不一样。

[end]
`;

const TRAINING_SCRIPT_END = `---
id: end_trust
title: 信任结局
characters: [alice]
---

@alice 没想到你这么快就和我成了朋友。

═══════════════════════════
   END：信任拉满
═══════════════════════════

[end]
`;

const TRAINING_ACTION_TALK = `id: talk
title: 找 Alice 聊天
description: 信任 +5
category: social
slot: day
cost: 1
effects:
  affection: { alice: 1 }
  stats: { trust: 5 }
`;

const TRAINING_ACTION_REST = `id: rest
title: 休息一下
description: 不做什么
category: rest
slot: any
cost: 1
`;

const TRAINING_ACTION_SLEEP = `id: sleep
title: 睡觉
description: 一天结束
category: rest
slot: night
cost: 1
kind: sleep
`;

const TRAINING_TEST = `name: 拉满 trust 应该触发结局
description: 注入 trust=50 验证 end_trust 触发
state:
  baseline:
    scripts:
      001_intro: { completed: true, selfSwitches: { A: false, B: false, C: false, D: false } }
    completionOrder: [001_intro]
  training:
    day: 2
    slot: 0
    stats: { trust: 50 }
    statMax: { trust: 100 }
inputs:
  - { type: next }
  - { type: next }
  - { type: next }
  - { type: next }
  - { type: next }
assertions:
  - kind: state
    path: baseline.scripts.end_trust.completed
    eq: true
  - kind: output
    type: gameEnd
    present: true
`;

const TRAINING_SCAFFOLD: PresetScaffold = {
  name: "training",
  dirs: ["characters", "scripts", "actions", "tests"],
  files: [
    { path: "game.yaml", content: TRAINING_GAME_YAML },
    { path: "characters/alice.md", content: CHARACTER_ALICE },
    { path: "scripts/001_intro.md", content: TRAINING_SCRIPT_INTRO },
    { path: "scripts/end_trust.md", content: TRAINING_SCRIPT_END },
    { path: "actions/talk.yaml", content: TRAINING_ACTION_TALK },
    { path: "actions/rest.yaml", content: TRAINING_ACTION_REST },
    { path: "actions/sleep.yaml", content: TRAINING_ACTION_SLEEP },
    { path: "tests/intro-test.yaml", content: TRAINING_TEST },
    { path: "README.md", content: README("\n这是一个 training 模式游戏 — hub + day/slot + 数值。") },
    { path: ".gitignore", content: GITIGNORE },
  ],
};

const PRESETS: Record<string, PresetScaffold> = {
  vn: VN_SCAFFOLD,
  training: TRAINING_SCAFFOLD,
};

export async function initCommand(args: Args): Promise<void> {
  const scaffold = PRESETS[args.preset];
  if (!scaffold) {
    throw new Error(
      `Unknown preset "${args.preset}". Available: ${Object.keys(PRESETS).join(" / ")}`,
    );
  }

  const target = path.resolve(args.dir);
  await ensureEmpty(target, args.force);

  await mkdir(target, { recursive: true });
  for (const d of scaffold.dirs) {
    await mkdir(path.join(target, d), { recursive: true });
  }
  for (const f of scaffold.files) {
    await writeFile(path.join(target, f.path), f.content, "utf-8");
  }

  let ejectNote = "";
  if (args.eject) {
    await ejectPreset(target, args.preset);
    // Rewrite game.yaml's `preset: <name>` to `preset: ./preset/run.ts`
    const yamlPath = path.join(target, "game.yaml");
    const current = await readFile(yamlPath, "utf-8");
    const updated = current.replace(
      /^preset:\s*\S+$/m,
      "preset: ./preset/run.ts",
    );
    await writeFile(yamlPath, updated, "utf-8");
    ejectNote =
      `\n  └── preset/                  ← ejected preset (edit run.ts to customize the loop)\n` +
      `\n[ejected] this game forks ${args.preset} preset's source into ./preset/.\n` +
      `          edits to ./preset/run.ts take effect on next play.\n` +
      `          engine API updates won't auto-flow in — sync manually if needed.\n`;
  }

  const display = args.dir;
  process.stdout.write(
    `✓ created RPG-Harness game at ${display} (preset: ${args.preset}${args.eject ? ", ejected" : ""})\n\n` +
      `  ${display}/\n` +
      scaffold.files.map((f) => `  ├── ${f.path}\n`).join("") +
      ejectNote +
      `\nnext:\n` +
      `  cd ${display}\n` +
      `  rpgh play .\n\n` +
      `to enable AI co-authoring/playing in this folder:\n` +
      `  cp -r <rpg-harness-repo>/.claude .\n`,
  );
}

// ============ eject implementation ============

// Files in packages/engine/src/presets/<name>/ that get copied into a
// game folder's preset/ dir. README.md is skipped (lives in engine
// repo); index.ts is included so internal sibling imports work.
const EJECT_INCLUDE_EXTS = [".ts"];

async function ejectPreset(targetDir: string, presetName: string): Promise<void> {
  const srcPresetDir = locateEnginePresetDir(presetName);
  const destDir = path.join(targetDir, "preset");
  await mkdir(destDir, { recursive: true });

  const entries = await readdir(srcPresetDir);
  for (const entry of entries) {
    const ext = path.extname(entry);
    if (!EJECT_INCLUDE_EXTS.includes(ext)) continue;
    const srcFile = path.join(srcPresetDir, entry);
    const destFile = path.join(destDir, entry);
    const content = await readFile(srcFile, "utf-8");
    await writeFile(destFile, rewriteImportsForEject(content), "utf-8");
  }
}

// Resolve packages/engine/src/presets/<name>/ from this file's
// location. Works for the workspace dev layout
// (packages/cli/src/commands/init.ts → ../../../engine/src/presets/).
// In a future npm-published scenario the engine package's src/ may not
// be present; we'd need to either ship presets/ as data or pre-bundle
// at publish time. Out of scope for the current monorepo-only workflow.
function locateEnginePresetDir(presetName: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../engine/src/presets", presetName);
}

// Rewrite `from "../../<anything>"` and `from "../../../<anything>"`
// imports to `from "@rpg-harness/engine"`. Sibling imports (`./xxx`) and
// existing package imports are left alone. The engine package
// re-exports everything ejected presets need (primitives, types,
// condition helpers, state utilities).
function rewriteImportsForEject(source: string): string {
  return source
    .replace(/from\s+"\.\.\/\.\.\/[^"]+"/g, 'from "@rpg-harness/engine"')
    .replace(/from\s+"\.\.\/\.\.\/\.\.\/[^"]+"/g, 'from "@rpg-harness/engine"');
}

async function ensureEmpty(target: string, force: boolean): Promise<void> {
  let info;
  try {
    info = await stat(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (!info.isDirectory()) {
    throw new Error(`${target} exists and is not a directory`);
  }
  if (force) return;
  const entries = await readdir(target);
  if (entries.length > 0) {
    throw new Error(
      `${target} is not empty. Use --force to overwrite, or pick a fresh path.`,
    );
  }
}
