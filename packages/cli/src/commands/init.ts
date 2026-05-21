import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface Args {
  dir: string;
  force: boolean;
}

const GAME_YAML = `title: 我的第一个 autogal 游戏
`;

const CHARACTER_ALICE = `---
id: alice
name: Alice
defaultAffection: 0
---

故事的关键角色。这一段是给作者看的，引擎不读。
`;

const SCRIPT_001 = `---
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

const TEST_BASIC = `name: 选"主动介绍自己" alice 应该 +2
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
    path: baseline.completedScripts
    includes: 001_intro
`;

const README = `# 我的 autogal 游戏

一个用 [autogal](https://github.com/luokerenx4/autogal) 引擎做的 GalGame。

## 玩

\`\`\`bash
autogal play .                          # 人玩（ink TUI）
autogal autoplay . --persona greedy -v  # AI 玩（内置 persona）
\`\`\`

## 写

游戏内容都是 markdown / yaml：

- \`game.yaml\` — 标题
- \`characters/\` — 角色定义
- \`scripts/\` — 台本
- \`tests/\` — 回归测试

边玩边改：进入 \`autogal play\` 后，直接在编辑器里改 \`.md\` 文件，下一句剧情会用新内容。

## 测试

\`\`\`bash
autogal test .
\`\`\`

## AI 协作

把 autogal 仓库的 \`.claude/skills/\` 拷过来：

\`\`\`bash
cp -r path/to/autogal/.claude .
\`\`\`

然后在这个目录里跑 \`claude\`，AI 自动知道怎么玩这个游戏（\`autogal-player\` skill）和怎么帮你写新内容（\`autogal-author\` skill）。

## License

MIT.
`;

const GITIGNORE = `# Player saves — local only
.autogal/

node_modules
.DS_Store
*.log
`;

const FILES: Array<{ path: string; content: string }> = [
  { path: "game.yaml", content: GAME_YAML },
  { path: "characters/alice.md", content: CHARACTER_ALICE },
  { path: "scripts/001_intro.md", content: SCRIPT_001 },
  { path: "tests/intro-test.yaml", content: TEST_BASIC },
  { path: "README.md", content: README },
  { path: ".gitignore", content: GITIGNORE },
];

export async function initCommand(args: Args): Promise<void> {
  const target = path.resolve(args.dir);
  await ensureEmpty(target, args.force);

  await mkdir(target, { recursive: true });
  await mkdir(path.join(target, "characters"), { recursive: true });
  await mkdir(path.join(target, "scripts"), { recursive: true });
  await mkdir(path.join(target, "tests"), { recursive: true });

  for (const f of FILES) {
    await writeFile(path.join(target, f.path), f.content, "utf-8");
  }

  const display = args.dir;
  process.stdout.write(
    `✓ created autogal game at ${display}\n\n` +
      `  ${display}/\n` +
      `  ├── game.yaml\n` +
      `  ├── characters/alice.md\n` +
      `  ├── scripts/001_intro.md\n` +
      `  ├── tests/intro-test.yaml\n` +
      `  ├── README.md\n` +
      `  └── .gitignore\n\n` +
      `next:\n` +
      `  cd ${display}\n` +
      `  autogal play .\n\n` +
      `to enable AI co-authoring/playing in this folder:\n` +
      `  cp -r <autogal-repo>/.claude .\n`,
  );
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
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(target);
  if (entries.length > 0) {
    throw new Error(
      `${target} is not empty. Use --force to overwrite, or pick a fresh path.`,
    );
  }
}
