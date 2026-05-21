import { render } from "ink";
import React from "react";
import type { Game } from "@autogal/engine";
import { App } from "./app";

export async function play(game: Game, gameDir: string): Promise<void> {
  const instance = render(React.createElement(App, { game, gameDir }));
  await instance.waitUntilExit();
}
