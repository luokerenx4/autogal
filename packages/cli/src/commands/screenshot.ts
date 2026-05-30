// `rpgh screenshot` — drive the TUI inside a real PTY, replay a key
// sequence, then dump the rendered terminal as plain text. Closes the
// CLI rendering test loop: engine + step + peek cover JSON output;
// this covers what the user actually SEES on screen.
//
// Implementation is split: this file does argv parsing + child-process
// orchestration, but the actual PTY work lives in screenshot-runner.cjs
// because node-pty's native binding currently hangs under Bun (onExit
// never fires). We spawn Node specifically for the runner, pipe its
// stdout back to ours.
//
// See screenshot-runner.cjs for the PTY + xterm-headless plumbing and
// the key-name encoding (Enter / Esc / Space / Up / Down / Tab / etc.).

import { spawn } from "node:child_process";
import path from "node:path";

interface Args {
  gameDir: string;
  keys: string;
  cols: number;
  rows: number;
  waitMs: number;
  session?: string;
  out?: string;
}

export async function screenshotCommand(args: Args): Promise<void> {
  const runner = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "screenshot-runner.cjs",
  );
  const payload = JSON.stringify({
    gameDir: args.gameDir,
    keys: args.keys,
    cols: args.cols,
    rows: args.rows,
    waitMs: args.waitMs,
    out: args.out ?? null,
    cwd: process.cwd(),
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("node", [runner], { stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`screenshot-runner exited ${code}`));
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}
