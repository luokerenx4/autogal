# 妖刀奇譚 / Sengoku Raid

一个用 [autogal](https://github.com/luokerenx4/autogal) 引擎做的**搜打撤 + GalGame**。日本战国时代，主角是 `spectral-demo` 主角的祖先 — 同样背着家伝的妖刀、同样的"灵体化"病。

**Headless RPGMaker 形态**：游戏 loop 在 `preset/run.ts`（ejected，按前缀路由 activity ids）；地图数据在 `maps/*.yaml`；战斗 + 状态机 + 角色邂逅 + 邦绊系统都在 `modules/raid.ts`。引擎 0 修改。

**这一例验证的设计假设**：
- "raid 不是 script，是 preset 的另一种 mode" — 通过 module 的 `mode: "hub" | "raid"` flag + `onHubBuild` first-wins hook 实现。raids 自然可重玩、`completedScripts` 不被污染。
- 引擎的 `dispatchActivity` 只认 `script:` / `action:` 前缀；我们的 ejected preset 又加了 `raid:` / `hub:` 走 module dispatcher。
- 战斗、loot、地图随机性全在 module action handlers 里跑（`ctx.rng()`），不依赖 script DSL 的随机分支（DSL 本身确定性）。

## 世界观

慶長十年。江戸城本丸。将軍家の側用人がお主を呼ぶ — 諸国に鬼が湧いている、家伝の妖刀使である你，要 traversal 江戸近郊讨伐並把妖物の遺骸帯回。

但家书提醒：斬れば斬るほど、自分の中にも鬼が積もる。**這是個取捨的循環。**

## 玩

```bash
autogal play .                                  # 自己玩
autogal autoplay . --persona extractor -v       # 看 AI 玩"能撤就撤"路线
autogal autoplay . --persona delver    -v       # 看 AI 玩"直推 boss"路线
autogal test .                                  # fixture 回归
```

## 数值

| 资源 | 范围 | 初始 | 作用 |
|---|---|---|---|
| `hp` | 0–30 | 30 | 战斗血量。Raid 内消耗，hub `hub:rest` 全回 |
| `mental` | 0–10 | 10 | 战斗里少用，预留给将来的 spirit 动作 |
| `spectral` | 0–100 | 5 | 每攻击 +1，胜斩后吸入刀里 -absorb。crit 概率 = `spec × 0.7%`，fumble 概率 = `spec × 0.5%`。≥100 → BAD END |
| `intellect` | 0–99 | 0 | 偷袭（`sneak_strike`）DC 公式的一部分 |
| `ryo`（道具）| 0–∞ | 100 | 通货 — 升刀、送礼、买卖 loot |

**妖刀** `ancestor_yaodao` — basePower 4。`hub:upgrade_weapon` 用 3 颗魂石碎片 + 100 两换 +2 power。打鬼胜利 swordGain = `max(1, floor(敌HP/4))`。

战斗公式（同 spectral-demo 公式族）：
```
基础伤害 = sword_power × (1 + spectral × 0.04) × random(0.8, 1.2)
胜利奖励 = absorb = floor(敌HP/2)        # spectral -absorb
        + swordGain = max(1, floor(敌HP/4))   # 妖刀威力 +N
临界成功率 = spectral × 0.7%      （×2 伤害）
临界失败率 = spectral × 0.5%      （敌人反击 ×1.6）
偷袭判定 = intellect × 5 + spectral × 0.5  > rng×100
逃跑判定 = rng×100 > 30 + spectral - 10
```

敌人反击数值不在 `EnemyDef` 的"engine universal"里 — 通过 `enemy.custom.attack_power` 读（PR #12 引入的 frontmatter passthrough）。例如 `enemies/kijin.md` 顶层就一行 `attack_power: 9`。

## 地图

| ID | 名 | 难度 | 撤离点 | 主要敌人 | 邂逅角色 |
|---|---|---|---|---|---|
| `kuro_swamp` | 黒沼地 | 1 | 潰れた社 / 奥の杜 | 下級の鬼（HP 8）| 篝 |
| `mt_houkyou` | 砲響山 | 3 | 焼け落ちた寺 / 火口 | 戦鬼（HP 18）+ 鬼神 boss（HP 45）| 霞 |

每张地图是 `maps/<id>.yaml`：zones 数组（每 zone 有 connections、encounter_table、loot_table、optional `is_extract`）+ `character_spawns` 数组。加新地图 = 加新文件，**0 module 改动**。

## 角色 + 技能

| 角色 | 出现地图 | 邂逅 zone | 邦绊技能（affection ≥ 4）|
|---|---|---|---|
| 篝（kagari） | kuro_swamp | crossroads / ruined_hut | **鎮魂法** — hub-only，`spectral -20` |
| 霞（kasumi） | mt_houkyou | stone_paths / lava_vent | **早駆け** — raid 中 `raid:flee` 永远成功 0 伤 |

邦绊路径：第一次踏入对应 zone 触发 `encounter_<id>_first.md`（spawn chance 1.0 → deterministic 故事节奏）→ 邂逅时选项决定首次 affection（+0/+1/+2）→ 回 hub 后 `hub:bond:<id>` 送礼（每次 +1，50 両）→ affection ≥2 解锁 `bond_<id>_01`，≥4 解锁 `bond_<id>_02`（grant skill）。

## Loop

```
HUB                            RAID
───                            ────
hub:depart:<map>     ───→     foothills / edge zone
↑                              │
│   sell_all_loot              │ raid:move:<zone>
│   upgrade_weapon             │     ├── 触发 character_spawn → script
│   bond / script:bond_*       │     ├── encounter rolled → combat
│   rest                       │     └── empty → search / move
│                              │
│   ←── extract success ←── raid:extract（必须 isExtract zone）
│                              │
│   ←── death ←─── HP ≤ 0 / spectral ≥ 100  (loadout lost)
```

死亡 = `state["sengoku-raid"].raid = null`，stash（baseline.inventory）保留，HP 重置为 1，`raidsFailed += 1`。
撤退成功 = raid.pendingLoot 转入 baseline.inventory，`raidsCompleted += 1`。

## Fixtures

8 个 fixture 锁定每条骨干路径：

| # | 检查 |
|---|---|
| 01 | 开局 state — flags 默认值 + 自动装刀 + intro 自动启动 |
| 02 | HP≤0 trigger → 模式回 hub + raidsFailed +1 + loadout 清零 |
| 03 | raid:extract → loot 进 stash + raidsCompleted +1 + HP 不重置 |
| 04 | 第一次到 crossroads → 篝 spawn + encounter script 入 completedScripts + metCharacters 更新 |
| 05 | bond_kagari_02 → `chinkonho` 进 knownSkills |
| 06 | bond_kasumi_02 → `hayagake` 进 knownSkills |
| 07 | combat 激活时 dispatcher 拒绝 move / search / extract |
| 08 | hub:upgrade_weapon 不满足条件时 narrate 拒绝原因 |

## Personas

| Persona | 策略 | 用途 |
|---|---|---|
| `extractor` | 见 extract zone 就撤；遇敌 flee；hub 里 sell+rest+depart 循环 | 验证"零战斗也能玩"（实际跑出 14 raids / 461 ryo / 0 deaths） |
| `delver` | 见敌必战；优先未踏过的 zone；全图踏完才 extract | 验证 boss 可达 — sword 从 4 长到 84+，kijin 被解决 |

定义在 `packages/cli/src/test/personas.ts`，需要读 `state["sengoku-raid"].raid.zones` 做 unvisited-pathfinding。这是目前 personas 需要 game-specific 知识的一处尖锐边 — 见仓库 issue 跟进。

## 这一局发现的引擎 bug（已修）

#9 — parser 丢自定义 frontmatter 字段：`attack_power` / `sell_value` 写在 .md 里被 parser 默默吃掉，module 只能维护 fallback 表。**修复**：每个 parser 现在用 `extractCustom()` 把未知 frontmatter key 收进 `def.custom`。

#10 — combat 激活时 dispatcher 仍接受非战斗 action：hub menu 锁了，但脚本玩家 / AI persona 能直接 dispatch `raid:move:*` 走人。**修复**：`combatBlock(ctx)` helper 在 move/search/extract 前 narrate refusal。

#11 — `hub:upgrade_weapon` 资源不足时静默 no-op：UI 无任何提示。**修复**：每个 hub:* 处理器现在 `denyWithNarration(ctx, msg)` 报具体原因（差几颗 / 差多少两 / 角色没见过 / HP 已满）。

3 issue 全在 PR #12 修完，过程详见 issues #9 #10 #11 + commit log。
