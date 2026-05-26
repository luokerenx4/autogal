# 辉夜潜行 / Kaguya Dive

《超时空辉夜姬！》(Studio Colorido, 2026/01) 主线之后那十年的同人养成。
彩叶 18 岁，刚进大学。辉夜失去实体，灵魂数据散在月读全网。
3 年内（原作压缩自 10 年）：捞数据 + 造身体 + 调查那个突然崛起的迷之主播 X。

## 玩

```bash
bun packages/cli/src/bin.ts play ./examples/kaguya-dive
```

12 个决策窗口（3 年 × 春夏秋冬 4 季）。冬天选「跨年」推进。

## 主线轨迹

- **Day 1 · 春**　开场 → 闺蜜（芦花 / 真实）登场
- **Day 1 · 夏后**　哥哥（朝日）首联系，开 Black onyX 服务器权限
- **x_intel ≥ 15**　X 第一次现身（idol / konbini 高级潜行概率掉）
- **memory ≥ 30 & bond ≥ 5**　八千代在月读核心出口等你
- **Day 2+**　真实察觉，雨夜上门
- **4 类数据全 ≥ 40**　通电前夜，闺蜜哥哥三人到场

## 结局（按优先级）

| 阈值 | 结局 |
|---|---|
| memory ≥ 60 & bond ≥ 8 & 其它任一 < 60 | **SECRET**　灵魂之约 |
| 4 类数据全 ≥ 60 & eng ≥ 40 & bond ≥ 6 | **GOOD**　通电那一刻她睁开了眼 |
| 4 类数据全 ≥ 60 & eng ≥ 40 | **NEUTRAL**　她不再是原来的她 |
| Day 4（三年结束） | **BAD**　兜底 |

## 演示提示

- **不要用 `--persona greedy`**　hub 选项字母排序，greedy 永远选 `call_asahi`，
  把钱攒满但不潜行 → 必 bad end。Persona 设计问题，非游戏 bug。
- **演示用** `--persona random` 或人玩。
- **验证 good ending 可达**：`bun packages/cli/src/bin.ts test ./examples/kaguya-dive`
  fixture 注入 day-3 接近通关的 stats，确认 end_good 触发。

## 结构

```
characters/    iroha / kaguya / yachiyo / x / ashihana / mami / asahi
actions/       上课 / 跑实验 / 打工 / 休息 / 跨年 / 喝咖啡 / 打电话 / 6 个 dive_*
scripts/       001_intro + 5 个 evt_* + 4 个 end_*
modules/       moon-dive.ts (~200 行)
tests/         good-ending-reachable.yaml
```

`moon-dive.ts` 做三件事：dive 动作的 RNG 掉落、剧情触发器、pending 队列
（让被 currentScript 占用阻塞的触发剧本不丢失）。
