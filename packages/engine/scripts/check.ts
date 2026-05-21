import { Engine } from "../src";
import type { Game, Input, Output } from "../src";

const game: Game = {
  title: "smoke-test",
  characters: [{ id: "alice", name: "Alice" }],
  scripts: [
    {
      id: "s1",
      title: "first",
      beats: [
        { type: "narration", text: "intro line" },
        {
          type: "choice",
          options: [
            { text: "be nice", effects: { affection: { alice: 1 } } },
            { text: "be rude", effects: { affection: { alice: -1 } } },
          ],
        },
        { type: "dialogue", speaker: "alice", text: "interesting." },
      ],
    },
    {
      id: "s2",
      title: "second (requires alice >= 1)",
      requires: { affection: { character: "alice", min: 1 } },
      beats: [{ type: "narration", text: "later that day." }],
    },
  ],
};

const transcript: Array<{ output: Output; input: Input }> = [];
const inputs: Input[] = [
  { type: "select", scriptId: "s1" },
  { type: "next" },
  { type: "next" },
  { type: "choose", index: 0 },
  { type: "next" },
  { type: "select", scriptId: "s2" },
  { type: "next" },
];

const engine = new Engine(game);
const runner = engine.run();
let cursor = 0;
let firstInput: Input | undefined = undefined;

while (true) {
  const result =
    firstInput === undefined
      ? await runner.next()
      : await runner.next(firstInput);
  firstInput = inputs[cursor++];
  if (result.done) {
    console.log("DONE");
    break;
  }
  console.log(JSON.stringify(result.value));
  transcript.push({ output: result.value, input: firstInput! });
  if (cursor > inputs.length + 2) {
    console.log("INPUTS EXHAUSTED");
    break;
  }
}

console.log("FINAL STATE:", JSON.stringify(engine.getState(), null, 2));
