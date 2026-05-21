import path from "node:path";
import { loadGame } from "../loader";
import { play } from "../play";

interface Args {
  gameDir: string;
}

export async function playCommand(args: Args): Promise<void> {
  const game = await loadGame(args.gameDir);
  const absoluteDir = path.resolve(args.gameDir);
  await play(game, absoluteDir);
}
