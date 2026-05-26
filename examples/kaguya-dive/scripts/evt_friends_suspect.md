---
id: evt_friends_suspect
title: 真实知道了
characters: [iroha, mami]
cost: 0
requires:
  switch: { name: __trigger_only, eq: true }
---

第二年。某个下雨的周末。

你打开公寓门，真实站在外面，手里两个便当。

@mami 进去说。

@iroha ……

@mami 我看见你上周凌晨四点在医院门口出现。两次。

@mami 你不是医学院的。

@iroha ……

@mami 你在做什么。

? 怎么回。
- "在帮一个朋友。她需要一个身体。" -> +2mami | goto pick_truth
- "做实验。别问。" -> -mami | goto pick_deflect
- "你别管。" -> -2mami | goto pick_push

# pick_truth

@mami ……

@mami 那个朋友，是不是已经不在了。

@iroha 不是。

@iroha 她还在。

@iroha 只是不完整。

@mami 嗯。

@mami 那你需要帮忙的时候，跟我说。

@mami 别一个人扛。

@mami 还有——

@mami 别跟芦花全讲。她嘴上嚷嚷，心里会塌的。

[end]

# pick_deflect

@mami ……

@mami 好。

@mami 便当放冰箱了。我走了。

[end]

# pick_push

@mami ……

@mami 你最后一次说"别管"是高三那次。

@mami 我希望你这次别再后悔一次。

@mami 走了。

[end]
