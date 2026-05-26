---
id: evt_friends_first
title: 闺蜜上线
characters: [iroha, ashihana, mami]
requires:
  switch: { name: __trigger_only, eq: true }
---

入学第三天。学生食堂二楼。

@ashihana 喂彩叶！这边！

@ashihana 我跟真实说了，新学期开学第一顿必须三个人一起吃。不然就是背叛。

@mami ……她真的说了。

@iroha 抱歉抱歉。我刚从工学馆过来。

@ashihana 工学馆？你不是来学唱歌制作的吗？

@iroha 我换专业了。

芦花夹了一筷子菜的手停在半空。

@ashihana 你跟我说什么？

@iroha 转去机电一体化方向了。下学期还要补两门神经科学。

@mami ……为什么？

@iroha 想做义体。

? 怎么解释。
- "高中那次大病留下的兴趣。" -> +ashihana | goto pick_lie
- "有人需要一个身体。我想造出来。" -> +mami +2ashihana | goto pick_truth_partial
- "不想说。" -> -ashihana +mami | goto pick_silent

# pick_lie

@ashihana ……噢。

@ashihana 那也行。反正你想干嘛干嘛，我们陪着。

@mami 嗯。

@ashihana 但你得保证一个月至少出来吃一次饭。不然我月读直播间挂你头像，每天编你的黑料。

@iroha 知道了知道了。

[end]

# pick_truth_partial

@ashihana 啊？

@ashihana 谁？你交男朋友了？？

@iroha 不是。

@mami 是女孩子吗。

@iroha ……

@mami （她没否认。）

@ashihana 哦。哦。

@ashihana 那行。

@ashihana 你需要钱跟我说一声。我直播间打赏分你一半。

@iroha 不用。

@ashihana 我没问你要不要。我说我会给。

@mami 我也是。

[end]

# pick_silent

@ashihana ……

@ashihana 行吧。你不说就不说。

@mami 彩叶。

@mami 你不用一次说完。慢慢说。

@iroha ……谢谢。

[end]
