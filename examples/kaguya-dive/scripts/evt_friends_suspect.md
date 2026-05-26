---
id: evt_friends_suspect
title: 真实知道了
characters: [iroha, mami]
cost: 0
requires:
  switch: { name: __trigger_only, eq: true }
---

六月。下雨的周末。

你出门倒垃圾，回来发现门口站着真实，撑着伞，手里两个便当。

@mami 啊，你出去过呀。

@mami 我以为你没醒，正想把便当挂门把手上。

@iroha ……进来吧。

她把伞收好。她进门时鞋子很认真地擦了好一会，比她平时还慢一点。

@mami 这个肉酱意面是隔壁店新出的。我拍了视频。

@mami 你尝尝看，跟你以前喜欢的那家像不像。

她把便当放好，没坐下。

@mami ……那个……

@mami 我前阵子赶稿，凌晨四点经过医院。

@mami 看见你站在那里。

@mami 然后过了两天又看见一次。

@iroha ……

@mami 你又不是学医的呀。

她语速比平时还慢一点，眼睛看着便当不看你。

@mami 在做什么呢？

? 怎么回。
- "在帮一个朋友。她需要一个身体。" -> +2mami | goto pick_truth
- "做实验。别问。" -> -mami | goto pick_deflect
- "你别管。" -> -2mami | goto pick_push

# pick_truth

@mami ……

@mami 那个朋友。

@mami 还在吗？

@iroha 在。

@iroha 只是不完整。

@mami 嗯……

@mami 那你以后扛不动的话，跟我说一声呀。

@mami 我可以陪你去医院。我装作我有点不舒服那种。

她笑了一下。然后停了一会。

@mami 还有……

@mami 别跟芦花一次讲完。她嘴上是嚷嚷，心里会塌的。

@mami 你想说她的时候，先跟我说。我帮你过一遍。

[end]

# pick_deflect

@mami ……嗯。

@mami 好。

@mami 那便当放冰箱啦。

@mami 凉了再热一下，微波炉中火三分钟。

她出门时把伞撑得很慢，像在等你叫她。

你没叫。

[end]

# pick_push

@mami ……

@mami 嗯。

她想了一会。

@mami 你上次说"别管"是高三那次。

@mami 我那次没管，后来你瘦了七公斤。

@mami 这次我会再多看你几眼。你不用回答。

@mami 走啦。意面热的时候记得撕掉透气膜。

[end]
