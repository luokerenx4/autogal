import { peek } from "@rpg-harness/engine";
import { loadGame } from "../loader";
import { joinVisualState } from "../presenters/visualSummary";
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
  const assetMap = new Map((game.assets ?? []).map((a) => [a.path, a]));
  // Join visualState (asset paths) with placeholder text so headless
  // consumers don't need a second lookup against game.assets to know
  // what each slot semantically depicts.
  const output =
    result.output && result.output.visualState
      ? {
          ...result.output,
          visualStateResolved: joinVisualState(
            result.output.visualState,
            assetMap,
          ),
        }
      : result.output;
  const payload = {
    output,
    done: result.done,
    state: result.state,
  };
  process.stdout.write(
    args.pretty ? JSON.stringify(payload, null, 2) + "\n" : JSON.stringify(payload) + "\n",
  );
}
