# Eject smoke test

This folder is an artifact of `rpgh init examples/eject-test --preset training --eject`.
The `preset/` directory is a copy of `packages/engine/src/presets/training/`
with imports rewritten from `../../primitives` / `../../types` etc. to
`@rpg-harness/engine`.

CI runs `bun run rpgh test .` against this folder to catch regressions
in the eject mechanism — e.g. if `@rpg-harness/engine` stops exporting a
symbol that ejected presets need, the fixture here will fail.

## Regenerating

If the engine's preset source changes meaningfully:

```bash
rm -rf examples/eject-test
bun run rpgh init examples/eject-test --preset training --eject --force
```

Then `bun run test` to verify.

## Editing the loop

This is also the smoke test for "AI authors edit `preset/run.ts`
directly." To verify the loop is editable:

1. Open `preset/run.ts`
2. Add a `console.log("hello from ejected loop")` somewhere
3. Run `bun packages/cli/src/bin.ts autoplay . --persona greedy -v`
4. Observe the log

(Hot reload of `.ts` files in play mode is not implemented — see the
eject section of the engine README for the constraint.)
