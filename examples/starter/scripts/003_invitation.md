---
id: 003_invitation
title: 周五放学
characters: [alice, bea]
requires:
  all:
    - scriptCompleted: 001_meeting_alice
    - scriptCompleted: 002_meeting_bea
---

星期五。最后一节课结束的铃声响起来。

你正在收拾书包，碧河从后排走过来，俯身靠在你桌上。

@bea 周末有空吗？我们部里去河边烧烤，要不要一起？

她话还没说完，你听到教室门口传来另一个声音。

@alice （站在门口，有些犹豫）……抱歉，我也想问你周六下午有没有空。

@narrator 两个女孩对视了一下，谁也没说话。

@narrator 你被夹在中间。

```yaml
type: choice
prompt: 你怎么选？
options:
  - text: "我答应碧河了。"
    effects:
      flags:
        route: bea
    goto: pick_bea
  - text: "薄樱先来的（其实是后到的，但你说先来）。"
    effects:
      flags:
        route: alice
    goto: pick_alice
  - text: "对不起，我周末有别的事。"
    effects:
      flags:
        route: neither
    goto: pick_neither
```

# pick_alice

@bea （耸了耸肩）那行吧，下次有机会再约。

@bea （转身走的时候）哎。

@alice （看着你）……谢谢。

@narrator 碧河走后，薄樱在教室门口跟你约好了集合时间。

```yaml
type: choice
prompt: 散场后
options:
  - text: 继续
    goto: $end
```

# pick_bea

@alice （安静地）……嗯，没事的。

@alice （冲你笑了一下）那祝你们玩得开心。

@narrator 她转身离开了。樱花季已经过了，她手里没拿素描本。

@bea 哦哦，那我们说好啦！我家就在河边，到时候我来接你。

```yaml
type: choice
prompt: 散场后
options:
  - text: 继续
    goto: $end
```

# pick_neither

@bea （挑眉）哎你这人。

@alice （低头）……那好。

@narrator 教室里只剩你一个人。窗外的天阴下来了。
