---
id: intro
title: hook-test intro
characters: [dev]
---

A narration beat.

@dev A dialogue beat.

? a choice prompt
- option A -> +dev | goto branch_a
- option B -> -dev | goto branch_b
- option C (no goto, falls through)

# branch_a

@dev Picked A.

[end]

# branch_b

@dev Picked B.
