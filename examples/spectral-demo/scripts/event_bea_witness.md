---
id: event_bea_witness
title: 河边的拷问
characters: [bea]
requires:
  all:
    - scriptCompleted: 002_first_youkai
    - affection: { character: bea, min: 3 }
    - day: { min: 4 }
---

放学。河堤上。碧河走在你前面半步突然回头。

@bea 你身上有股味。

@bea 不是汗味——是那种"刚打过架"的味道。

@bea 而且不是普通的架。

? 怎么回？
- "你瞎说什么。" -> -bea
- "你鼻子真灵。" -> +bea
- "我有件事要告诉你。" -> +2bea

@bea （咧嘴一笑）我就喜欢有故事的人。

@bea 真的需要帮手的时候，叫我。我会去。

[end]
