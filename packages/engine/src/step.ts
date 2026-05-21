import { Engine } from "./engine";
import type { ComposedState, Game, Input, Output } from "./types";

export interface StepResult {
  output: Output | null;
  state: ComposedState;
  done: boolean;
}

export async function peek(
  game: Game,
  state: ComposedState,
): Promise<StepResult> {
  const engine = new Engine(game, state);
  const runner = engine.run();
  const first = await runner.next();
  await runner.return();
  return {
    output: first.done ? null : first.value,
    state: engine.getState(),
    done: first.done === true,
  };
}

export async function step(
  game: Game,
  state: ComposedState,
  input: Input,
): Promise<StepResult> {
  const engine = new Engine(game, state);
  const runner = engine.run();
  const prime = await runner.next();
  if (prime.done) {
    return {
      output: null,
      state: engine.getState(),
      done: true,
    };
  }
  const next = await runner.next(input);
  await runner.return();
  return {
    output: next.done ? null : next.value,
    state: engine.getState(),
    done: next.done === true,
  };
}
