# hook-test

A tiny game-folder fixture used to validate the engine's lifecycle hook
surface (added in C2). Not meant to be played as content — the script
is two beats and a goto.

The `modules/tracker.ts` module registers every hook on the `Module`
interface, logs each fire to `state["hook-tracker"].log`, and acts as
an opt-in transformer driven by `state.baseline.flags`:

| flag | type | effect |
|---|---|---|
| `skipBeatIdx` | number | tracker's `onBeatBefore` returns `{ skip: true }` for that beat index |
| `redirectScriptTo` | string | tracker's `onScriptSelect` returns this id instead of what player picked |
| `cancelActions` | boolean | tracker's `onActionDispatch` returns `"cancel"` |
| `filterChoiceIdx` | number | tracker's `onChoicePresented` marks that option `available: false` |

Each fixture sets one flag (or none) and asserts the resulting log
shape. The point is to verify hook dispatch + the three compose
strategies (observer / first-wins / reducer) work end-to-end.

Run: `bun packages/cli/src/bin.ts test examples/hook-test`
