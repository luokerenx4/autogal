import path from "node:path";
import React from "react";
import { render } from "ink";
import { loadGame } from "../loader";
import { play } from "../play";
import { discoverGames, type GameCandidate } from "../games";
import { GamePicker } from "../components/GamePicker";

interface Args {
  gameDir?: string;
}

export async function playCommand(args: Args): Promise<void> {
  let gameDir = args.gameDir;
  if (!gameDir) {
    const candidates = await discoverGames(["./", "./examples"]);
    if (candidates.length === 0) {
      process.stderr.write(
        "没找到任何 RPG-Harness 游戏（需要含 game.yaml 的目录）。\n用法: rpgh play <game-dir>\n",
      );
      process.exit(2);
    }
    // Always show the picker, even for a single candidate — the picker
    // surface also exposes save sessions, so auto-picking robs the
    // player of the "新游戏 / 继续" choice. Explicit-path invocation
    // (`rpgh play <dir>`) skips the picker as before.
    const picked = await pickGame(candidates);
    if (!picked) return;
    gameDir = picked.dir;
  }
  const game = await loadGame(gameDir);
  const absoluteDir = path.resolve(gameDir);
  await play(game, absoluteDir);
}

async function pickGame(
  candidates: GameCandidate[],
): Promise<GameCandidate | null> {
  let chosen: GameCandidate | null = null;
  const instance = render(
    React.createElement(GamePicker, {
      candidates,
      onSelect: (c: GameCandidate | null) => {
        chosen = c;
      },
    }),
  );
  await instance.waitUntilExit();
  return chosen;
}
