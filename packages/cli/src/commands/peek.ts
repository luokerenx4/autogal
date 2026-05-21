import { peek } from "@autogal/engine";
import { loadGame } from "../loader";
import { loadSession } from "../session";

interface Args {
  gameDir: string;
  session: string;
  pretty: boolean;
}

export async function peekCommand(args: Args): Promise<void> {
  const game = await loadGame(args.gameDir);
  const state = await loadSession(args.gameDir, args.session, game);
  const result = await peek(game, state);
  const payload = {
    output: result.output,
    done: result.done,
    state: result.state,
  };
  process.stdout.write(
    args.pretty ? JSON.stringify(payload, null, 2) + "\n" : JSON.stringify(payload) + "\n",
  );
}
