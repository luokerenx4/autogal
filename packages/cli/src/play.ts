import { render } from "ink";
import type { Instance } from "ink";
import React from "react";
import type { Game } from "@rpg-harness/engine";
import { App } from "./app";
import { InkInstanceProvider } from "./ink-instance";

// Enter the terminal's alternate screen buffer (xterm "ti" / 1049h) so the
// game takes over the viewport — every ink rerender starts at the top of a
// fresh screen instead of scrolling into the terminal's scrollback. On exit
// we leave the alt buffer and the user's prior prompt+history reappears.
// Without this, ink streams output linearly: when a frame is taller than
// the terminal, content older than the viewport scrolls off-screen and
// macOS Terminal in particular doesn't auto-scroll to keep up.
const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[?25l"; // alt buf + hide cursor
const EXIT_ALT_SCREEN = "\x1b[?1049l\x1b[?25h";  // restore main buf + cursor

export async function play(game: Game, gameDir: string): Promise<void> {
  const isTTY = process.stdout.isTTY;
  if (isTTY) process.stdout.write(ENTER_ALT_SCREEN);
  const cleanup = () => {
    if (isTTY) process.stdout.write(EXIT_ALT_SCREEN);
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); process.exit(143); });
  try {
    // Provider gets a mutable ref because `render()` returns the
    // Instance synchronously, but React needs the value to be
    // construct-time. We populate the ref immediately after the call
    // so children's first read sees it.
    const ref: { current: Instance | null } = { current: null };
    const instance = render(
      React.createElement(InkInstanceProvider, {
        value: ref,
        children: React.createElement(App, { game, gameDir }),
      }),
    );
    ref.current = instance;
    await instance.waitUntilExit();
  } finally {
    cleanup();
    process.off("exit", cleanup);
  }
}
