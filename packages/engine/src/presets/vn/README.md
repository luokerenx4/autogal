# vn preset

Pure visual-novel game loop. No hub, no calendar, no actions — just
scripts. After each script finishes, the player picks the next one from
the `scriptComplete` Output.

This is what `examples/starter` runs on. To write your own VN-shaped
game, scaffold via:

```bash
rpgh init my-vn --preset vn
```

To eject the loop body so you can edit it directly:

```bash
rpgh init my-vn --preset vn --eject
# → my-vn/preset/run.ts copied from this file with imports rewritten
#   to import from @rpg-harness/engine
```

After ejecting, your `my-vn/game.yaml` will set `preset: ./preset/run.ts`
and the engine will load your fork instead of the bundled vnRun.

## What this loop does

```
loop:
  drain pending narrations  // one at a time across step() calls
  if a script is in progress: runScript → onScriptComplete
  else:
    yield scriptComplete picker with available scripts
    wait for select input → fire onScriptSelect → set currentScriptId
```

That's it. ~60 lines of code in `run.ts`. The training preset's
`run.ts` is structurally similar but adds end-condition checks, a hub
output, and action dispatch.
