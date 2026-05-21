# 妖刀さくら抄 / Spectral Suite

一个用 [autogal](https://github.com/luokerenx4/autogal) 引擎做的**养成 + GalGame + 战斗** demo。

**Headless RPGMaker 形态**：游戏 loop 在 `preset/run.ts`（ejected 自引擎内置 training preset，作者可改）；所有资产都是 typed databases (`items/` / `enemies/` / `weapons/` / `skills/`)；战斗公式 + 触发器在 `modules/combat.ts`。引擎层只提供 schema 和 primitives。

## 世界观

你转入位于山顶的"樱花谷高校"。山下是一座坍塌的镇魔神社，每晚都有妖怪从地脉里冒出来。你来自退魔师家族但传承断代——家传**妖刀**目前威力只有 3，而你体内的"**灵体化**"已经 5 了。家书说：

> 每天晚上去山下镇压一只妖怪，把它的力量吸进刀里。这是唯一让灵体化降下来的办法。当妖刀威力到达 25 以上，你才有资格做最终的"镇魂仪式"。

**白天积累羁绊和数值，晚上斩妖压住自己。十四天内做不到，就要么变怪，要么时间到。**

## 玩

```bash
autogal play .                                 # 自己玩
autogal autoplay . --persona hunter -v         # 看 AI 退魔师 persona 玩
autogal test .                                 # fixture 回归
```

## 数值

| Stat | 名字 | 范围 | 初始 | 作用 |
|---|---|---|---|---|
| spectral | 灵体化 | 0-100 | 5 | **核心**：决定战斗强度 + 风险。**每天自然 +2** |
| physical | 体力 | 0-20 | 10 | 白天行动燃料 |
| mental | 精神 | 0-10 | 5 | 晚上行动 + 抗污染 |
| intellect | 学识 | 0-99 | 0 | 解锁特殊事件 |

**妖刀**（武器资源 — C8 之后从 stat 迁到 weapon DB）：

| Weapon | 字段 | 初始 | 作用 |
|---|---|---|---|
| yaodao | basePower | 3 | 战斗 damage 基数；night_study / 斩妖时增长 |

战斗公式：

```
妖怪 HP = floor(6 + day × 1.5)
基础伤害 = sword_power × (1 + spectral × 0.04) × random(0.8, 1.2)
胜利奖励 = max(2, floor(妖怪HP / 4))   # 妖刀威力 +N
临界成功率 (crit, ×2 伤害) = spectral × 0.7%
临界失败率 (fumble, 0 伤害 + 自伤 -3 体力) = spectral × 0.5%
```

灵体化越高，战斗越激烈但越不稳定。

## 5 个结局

| 结局 | 触发条件 |
|---|---|
| 🔴 **灵体化结局** | 灵体化达到 100 — 你被自己的力量吞噬 |
| 🟠 **时间耗尽** | Day > 14 但妖刀威力 < 25 |
| 🟢 **薄樱真结局** | 完成镇魂仪式 + 薄樱好感 ≥ 4 |
| 🟢 **碧河真结局** | 完成镇魂仪式 + 碧河好感 ≥ 4 |
| 🟡 **单身英雄** | 完成镇魂仪式 + 无人好感 ≥ 4 |

## 节奏建议（提示）

- **Day 1-2**：完成 001_arrival 和 002_first_youkai；白天攒 intellect 解锁 night_study（需 mental ≥ 3 + intellect ≥ 3）
- **Day 3-7**：晚上 night_study 把 sword_power 推到 9-10（每次 +2，mental -2，与 sleep 交替）；白天 meet_alice/bea 攒好感同时也回 mental
- **Day 4 起**：alice/bea 好感 ≥ 3 触发 event_alice_witness / event_bea_witness（坦白真相 +2 好感）
- **Day 8-11**：sword_power 已经够高，开始 hunt 大幅加速。Day 8 妖怪 HP 18，sw 10+ 配 spectral ≥ 30 能稳赢
- **Day 12-13**：sword_power ≥ 20 + 心仪角色好感 ≥ 4，做镇魂仪式（006_seal_ritual）
- **危险信号**：spectral ≥ 80 时小心 fumble；用 shrine_pray 压一下，或者带 intellect ≥ 5 的状态去 hunt 触发 reroll（详见 combat.ts）

## fixture 测试

```bash
autogal test .   # 跑 tests/*.yaml 验证 engine 行为
```

包含两个 fixture：开局数值校验、spectral=100 forced bad ending。
