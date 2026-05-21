# 樱花季 / Cherry Blossom Season

The bundled demo game for [autogal](../../).

A short slice-of-life VN: you transfer to a new high school in spring.
Cherry blossoms are still on the trees. Two girls cross your path in
the first week. By Friday afternoon, both of them want your weekend.

You get to choose.

## How to play

From the repo root:

```bash
bun run play          # ink TUI, keyboard interaction
```

Or watch an AI:

```bash
bun run autoplay
```

## Routes & endings

```
001_meeting_alice  →  002_meeting_bea  →  003_invitation
                                              │
                ┌─────────────────────────────┼─────────────────────────────┐
                │                             │                             │
        route: alice                 route: bea                    route: neither
                │                             │                             │
        004a_alice_route              004b_bea_route                       │
                │                             │                             │
       ┌────────┴────────┐           ┌────────┴────────┐                   │
       │                 │           │                 │                   │
    alice≥4          alice<4       bea≥4            bea<4                  │
       │                 │           │                 │                   │
   005a_alice_good   005b_alice_bad  005c_bea_good   005d_bea_bad     005e_lonely
```

5 endings. The neither-route is the shortest path through the game (3 scripts).
The good endings require sustained affection across two scripts each.

## Cast

- **薄樱 (Alice)** — 樱花树下偶遇的女孩。话不多，喜欢素描。
- **碧河 (Bea)** — 你的同班同学。足球部，元气满满，偶尔会安静下来。

## Fork & modify

A game is a folder. Fork it, edit any `.md` file, run again.

```bash
cp -r examples/starter my-fork
# edit my-fork/scripts/001_meeting_alice.md ...
autogal play ./my-fork
```

The engine reloads markdown on every step. No build, no restart.
