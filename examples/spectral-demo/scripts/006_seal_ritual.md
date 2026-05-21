---
id: 006_seal_ritual
title: 镇魂仪式
characters: []
requires:
  all:
    - stat: { name: sword_power, min: 25 }
    - day: { min: 8 }
---

凌晨四点。你站在山下塌掉的神社遗址。

@narrator 妖刀的震动比平时强了一百倍。

家书最后一页：当妖刀威力到达 25 以上，你才有资格做"镇魂"——把这一带所有妖力一次性封印进刀里。

@narrator 你蹲下，将刀插入地面。

@narrator 整个山头开始发光。

很多年前坍塌的神社遗迹下，被困了几十年的本源妖力涌出来——它知道这是最后一次见到天光的机会。

? 你怎么做？
- 集中精神，强行压制 -> +mental,+sword_power | goto press
- 让妖刀自己跟它谈判 -> +sword_power | goto talk
- 调用所有体内的灵体化，硬碰硬 -> +sword_power+sword_power | goto force

# press

@narrator 你咬牙，把所有精神力灌进刀里。它被你的意志压制下去了。

# talk

@narrator 你松开了攥着刀柄的手。妖刀自己嗡嗡作响——像在跟它对话。
@narrator 良久，它静下来了。

# force

@narrator 你打开自己。让灵体化倾泻进刀里，再倾泻进地里。
@narrator 你做完后，半小时没办法站起来。

地面恢复了平静。神社遗址不再泄漏妖力了。

@narrator 你做到了。从今往后这一带不会再有妖怪。

@narrator 现在只剩——决定下一步。

[end]
