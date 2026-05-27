---
id: evt_asahi_first
title: 哥哥打来的电话
characters: [iroha, asahi]
cost: 0
requires:
  switch: { name: __trigger_only, eq: true }
---

晚上十一点。哥哥的来电。

@asahi 听说你转专业了。

@iroha 嗯。

@asahi 跟妈说了吗。

@iroha 还没。

@asahi 那先别说。爸不在以后她操心多。等你做出东西来再说。

@iroha ……谢谢。

@asahi 缺钱跟我开口。别去借校园贷。别打三份工。我看见你脸色了。

@iroha 嗯。

@asahi 还有一件事。

@asahi 战队下周给我搞了套新外设。旧的那套，反应速度抽帧数据全套备份留在战队服务器里。

@asahi 我把权限给你开了。你要看，自己去。

@iroha ……为什么？

@asahi 因为你不会无缘无故转专业。

@asahi 我不问。但我帮。

? 怎么说。
- "哥。我可能在做一件很难解释的事。" -> +2asahi | goto pick_open
- "嗯。谢谢。" -> +asahi | goto pick_brief

# pick_open

@asahi 我知道。

@asahi 解释的事以后再说。先吃饭。

@asahi 我挂了。明天我有比赛。

[end]

# pick_brief

@asahi 嗯。

@asahi 挂了。

[end]
