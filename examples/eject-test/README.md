# 我的 RPG-Harness 游戏

一个用 [RPG-Harness](https://github.com/luokerenx4/rpg-harness) 引擎做的 GalGame。

这是一个 training 模式游戏 — hub + day/slot + 数值。

## 玩

```bash
rpgh play .                          # 人玩（ink TUI）
rpgh autoplay . --persona greedy -v  # AI 玩
```

## 写

游戏内容都是 markdown / yaml + 可选的 ts module：

- `game.yaml` — 标题、preset、可选 modules / training 配置
- `characters/` — 角色定义
- `scripts/` — 台本
- `actions/` — training 模式才用，hub 上的动作
- `tests/` — 回归测试

## 测试

```bash
rpgh test .
```

## AI 协作

把 RPG-Harness 仓库的 `.claude/skills/` 拷过来；AI 自动知道怎么玩这个游戏（`rpg-harness-player` skill）和怎么帮你写新内容（`rpg-harness-author` skill）。
