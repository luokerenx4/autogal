import { step } from "@autogal/engine";
import type { Input } from "@autogal/engine";
import { loadGame } from "../loader";
import { appendLog, loadSession, saveSession } from "../session";

interface Args {
  gameDir: string;
  session: string;
  input: string;
  pretty: boolean;
}

export async function stepCommand(args: Args): Promise<void> {
  const game = await loadGame(args.gameDir);
  const state = await loadSession(args.gameDir, args.session, game);
  let input: Input;
  try {
    input = JSON.parse(args.input) as Input;
  } catch (err) {
    throw new Error(`Invalid --input JSON: ${(err as Error).message}`);
  }
  const result = await step(game, state, input);
  await saveSession(args.gameDir, args.session, result.state);
  await appendLog(args.gameDir, args.session, {
    t: Date.now(),
    input,
    output: result.output,
  });
  const payload = {
    output: result.output,
    done: result.done,
    state: result.state,
  };
  process.stdout.write(
    args.pretty ? JSON.stringify(payload, null, 2) + "\n" : JSON.stringify(payload) + "\n",
  );
}
