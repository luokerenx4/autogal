---
id: 005c_bea_good
title: 下学期的赛季
characters: [bea]
requires:
  all:
    - variable: { name: route, eq: bea }
    - scriptCompleted: 004b_bea_route
    - affection: { character: bea, min: 4 }
---

下学期第一周。碧河在校门口堵到你。

@bea 喂，我替你报名足球部了。

? ……
- "我没说要进啊。" -> +bea
- "好啊。" -> +bea
- "你为什么不先问问我？" -> +bea

@bea 因为问了你也会答应。

@bea 而且——我希望你周末有事干。

她笑得很坏，但你能看见她耳朵尖红了。

@bea 还有，我那天在河边说的话。

@bea 我没改主意。

═══════════════════════════
   GOOD END：踢球去
═══════════════════════════
