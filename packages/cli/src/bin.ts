#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { peekCommand } from "./commands/peek";
import { stepCommand } from "./commands/step";
import { sessionsCommand } from "./commands/sessions";
import { playCommand } from "./commands/play";
import { testCommand } from "./commands/test";
import { autoplayCommand } from "./commands/autoplay";
import { initCommand } from "./commands/init";
import { screenshotCommand } from "./commands/screenshot";

const HELP = `autogal — a headless RPG Maker for the terminal

USAGE
  autogal <command> [args]

COMMANDS
  play     [<game-dir>]
      Run the interactive TUI (ink). Requires a real terminal.
      Without <game-dir>, scans ./ and ./examples for folders with
      game.yaml and shows a picker.

  peek     <game-dir> [--session NAME] [--pretty]
      Print the current Output for the session without applying any input.
      Defaults to session "default". Creates an initial state if none exists.

  step     <game-dir> --input JSON [--session NAME] [--pretty]
      Apply one Input and return the next Output. Persists state.
      Example: autogal step ./my-game --input '{"type":"next"}'

  sessions <game-dir>
      List existing sessions (one per line, stdout). Empty status to stderr.

  test     <game-dir>
      Run all fixtures under <game-dir>/tests/*.yaml. Exits 1 on failure.

  autoplay <game-dir> --persona NAME [-v|--verbose] [--max-steps N] [--seed N]
      Have a built-in AI persona play through the game and report the ending.
      Personas: greedy / charmer / rude / random
      Without -v, only prints the final JSON summary to stdout.

  init     <dir> [--preset vn|training] [--eject] [--force]
      Scaffold a minimal autogal game in <dir>. Creates game.yaml,
      a sample character, a sample script, a test fixture, README, .gitignore.
      Refuses if <dir> is non-empty unless --force.
      --preset selects the game-loop shape: "vn" (default, pure visual
      novel) or "training" (hub + day/slot/stats). --eject additionally
      copies the preset's main-loop source into <dir>/preset/ with
      imports rewritten so the author can edit run.ts directly.

  screenshot <game-dir> [--keys "K1,K2,..."] [--cols N] [--rows N]
             [--wait-ms N] [--out FILE]
      Spawn the TUI inside a PTY, replay a key sequence, and dump the
      rendered terminal as plain text. Used to capture what the user
      actually sees in their terminal — closes the test loop for ink
      rendering the same way Playwright does for web. Keys are
      comma-separated: named (Enter, Esc, Space, Up, Down, Tab,
      Backspace, Left, Right) or literal chars; ":NNN" inserts a delay.
      Example: --keys "Enter,Enter,Enter,2" navigates the hub picker
      into a new game, advances two beats, then picks activity 2.

FLAGS
  --session NAME   Session id (folder under .autogal/sessions/). Default: "default"
  --input JSON     Engine Input as JSON string (for "step")
  --pretty         Indent JSON output (for "peek" and "step")

State is persisted at <game-dir>/.autogal/sessions/<name>/state.json.
A log of (input, output) pairs is appended to log.jsonl per session.
`;

const args = process.argv.slice(2);
const [subcommand, ...rest] = args;

async function main(): Promise<void> {
  if (!subcommand || subcommand === "-h" || subcommand === "--help") {
    process.stdout.write(HELP);
    return;
  }
  switch (subcommand) {
    case "play":
      return runPlay(rest);
    case "peek":
      return runPeek(rest);
    case "step":
      return runStep(rest);
    case "sessions":
      return runSessions(rest);
    case "test":
      return runTest(rest);
    case "autoplay":
      return runAutoplay(rest);
    case "init":
      return runInit(rest);
    case "screenshot":
      return runScreenshot(rest);
    default:
      process.stderr.write(`Unknown command: ${subcommand}\n\n${HELP}`);
      process.exit(1);
  }
}

function requirePositional(positionals: string[], usage: string): string {
  if (positionals.length !== 1 || !positionals[0]) {
    process.stderr.write(`Usage: ${usage}\n`);
    process.exit(2);
  }
  return positionals[0];
}

async function runPlay(args: string[]): Promise<void> {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  if (positionals.length > 1) {
    process.stderr.write("Usage: autogal play [<game-dir>]\n");
    process.exit(2);
  }
  const gameDir = positionals[0];
  await playCommand(gameDir ? { gameDir } : {});
}

async function runPeek(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      session: { type: "string", default: "default" },
      pretty: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const gameDir = requirePositional(
    positionals,
    "autogal peek <game-dir> [--session NAME] [--pretty]",
  );
  await peekCommand({
    gameDir,
    session: values.session ?? "default",
    pretty: Boolean(values.pretty),
  });
}

async function runStep(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      session: { type: "string", default: "default" },
      input: { type: "string" },
      pretty: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const gameDir = requirePositional(
    positionals,
    "autogal step <game-dir> --input JSON [--session NAME] [--pretty]",
  );
  if (!values.input) {
    process.stderr.write("Missing required flag: --input\n");
    process.exit(2);
  }
  await stepCommand({
    gameDir,
    session: values.session ?? "default",
    input: values.input,
    pretty: Boolean(values.pretty),
  });
}

async function runSessions(args: string[]): Promise<void> {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const gameDir = requirePositional(positionals, "autogal sessions <game-dir>");
  await sessionsCommand({ gameDir });
}

async function runTest(args: string[]): Promise<void> {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const gameDir = requirePositional(positionals, "autogal test <game-dir>");
  await testCommand({ gameDir });
}

async function runInit(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      force: { type: "boolean", default: false },
      preset: { type: "string", default: "vn" },
      eject: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const dir = requirePositional(
    positionals,
    "autogal init <dir> [--preset vn|training] [--eject] [--force]",
  );
  await initCommand({
    dir,
    force: Boolean(values.force),
    preset: String(values.preset ?? "vn"),
    eject: Boolean(values.eject),
  });
}

async function runAutoplay(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      persona: { type: "string", default: "greedy" },
      verbose: { type: "boolean", short: "v", default: false },
      "max-steps": { type: "string", default: "1000" },
      seed: { type: "string" },
    },
    allowPositionals: true,
  });
  const gameDir = requirePositional(
    positionals,
    "autogal autoplay <game-dir> [--persona NAME] [-v] [--max-steps N] [--seed N]",
  );
  await autoplayCommand({
    gameDir,
    persona: values.persona ?? "greedy",
    verbose: Boolean(values.verbose),
    maxSteps: Number(values["max-steps"] ?? "1000"),
    ...(values.seed !== undefined ? { seed: Number(values.seed) } : {}),
  });
}

async function runScreenshot(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      keys: { type: "string", default: "" },
      cols: { type: "string", default: "100" },
      rows: { type: "string", default: "30" },
      "wait-ms": { type: "string", default: "400" },
      session: { type: "string" },
      out: { type: "string" },
    },
    allowPositionals: true,
  });
  const gameDir = requirePositional(
    positionals,
    "autogal screenshot <game-dir> [--keys ...] [--cols N] [--rows N] [--wait-ms N] [--out FILE]",
  );
  await screenshotCommand({
    gameDir,
    keys: values.keys ?? "",
    cols: Number(values.cols ?? "100"),
    rows: Number(values.rows ?? "30"),
    waitMs: Number(values["wait-ms"] ?? "400"),
    ...(values.session !== undefined ? { session: values.session } : {}),
    ...(values.out !== undefined ? { out: values.out } : {}),
  });
}

main().catch((err) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
