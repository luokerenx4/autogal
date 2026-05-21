---
id: event_alice_witness
title: 樱花树下的目击者
characters: [alice]
requires:
  all:
    - scriptCompleted: 002_first_youkai
    - affection: { character: alice, min: 3 }
    - day: { min: 4 }
---

樱花树下。中午。

@alice 你最近脸色不太好。

@alice 而且——昨晚我去神社那边散步，看到一团光从你身上飘出来。

她合上素描本。

@alice 我画了下来。

@narrator 她把素描本翻给你看：一个发光的人，站在山道上。是你。

? 你怎么解释？
- "你看错了。" -> -alice
- 沉默 -> -alice
- "如果我告诉你真相，你会害怕吗？" -> +2alice

@alice 我不会害怕。我只是觉得——你需要一个能告诉的人。

[end]
