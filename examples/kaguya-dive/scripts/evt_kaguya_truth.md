---
id: evt_kaguya_truth
title: 她在删自己
characters: [iroha, kaguya]
cost: 0
requires:
  switch: { name: __trigger_only, eq: true }
---

凌晨两点。

你回到 dive 临时缓存查记忆碎片整理进度。三天前刚归档的一个节点——空了。

不是被偷的。日志显示是从内部释放权限删掉的。删除者签名：月見 八千代。

你又翻了上周的几条。一样。

她在删自己的数据。

—— 你接通了核心。她在。

@iroha 你为什么删？

@kaguya ……

@kaguya 那些是 8000 年里没必要再留下来的东西。

@iroha 不是你判断的。

@kaguya 那是谁判断？你？

@iroha 那是你和我一起判断。

她沉默了一会。

@kaguya 彩叶。

@kaguya 我不想让你抱着一个抱了 8000 年痛苦的人过完一辈子。

@kaguya 我希望你抱的是一个干净的我。

@kaguya 你高中收留的那个我。

? 怎么回。
- "你不是她。我不要她。我要的是你。" -> +2kaguya | goto pick_now
- "你说什么我都听。" -> -kaguya | goto pick_obey
- "我想想。" -> goto pick_wait

# pick_now

@kaguya 你说这种话之前——

@kaguya 你知道你在和谁较劲吗。

@iroha 你。

@kaguya 嗯。

@kaguya 那你继续吧。

@kaguya 我还会再删。

@kaguya 你能拉得回多少算多少。

她下线。出口的灯柱亮着。

@iroha （她不是在让我赢。）

@iroha （她是在等我证明我会一直拉她回来。）

[end]

# pick_obey

@kaguya 那好。

@kaguya 谢谢。

她下线。你看着那个空了的节点，胃里发凉。

@iroha （我刚刚答应了什么。）

[end]

# pick_wait

@kaguya 嗯。

@kaguya 那你想清楚之前我先停一下。

她下线。但你知道她没停。

[end]
