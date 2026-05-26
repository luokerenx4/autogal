import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Args {
  gameDir: string;
  apiPort: number;
  webPort: number;
  open: boolean;
}

// `autogal studio <game-dir>` — boots the browser-based authoring
// workbench. Two subprocesses run in parallel:
//   1. Bun API server (packages/studio/src/server/index.ts) — reads
//      the game dir, serves /api/* and /files/*
//   2. Vite dev server — serves the React SPA with HMR, proxies the
//      two prefixes above to (1)
//
// The CLI just orchestrates: spawns both, forwards stdout/stderr,
// kills both on Ctrl+C. v1 doesn't ship a built bundle; production
// "studio start" mode is deferred until the v2 write-operations PR
// when we'll also figure out packaging.
export async function studioCommand(args: Args): Promise<void> {
  // Studio package lives next to @autogal/cli in the monorepo. We
  // resolve its path via the @autogal/studio package — the same
  // technique the engine/parser packages use to import each other.
  const studioRoot = await resolveStudioRoot();
  const gameDir = path.resolve(args.gameDir);

  const env = {
    ...process.env,
    STUDIO_API_PORT: String(args.apiPort),
    STUDIO_WEB_PORT: String(args.webPort),
  };

  // 1. API server. `bun run` so workspace import resolution works the
  // same as during package-internal scripts.
  const api = spawn(
    "bun",
    ["run", "src/server/index.ts", gameDir],
    { cwd: studioRoot, env, stdio: "inherit" },
  );

  // 2. Vite dev server. Same cwd so it picks up vite.config.ts /
  // index.html. `--clearScreen false` keeps the API's startup lines
  // visible above Vite's banner.
  const web = spawn(
    "bun",
    ["x", "vite", "--clearScreen", "false"],
    { cwd: studioRoot, env, stdio: "inherit" },
  );

  // Single shutdown path: when either child dies (incl. via SIGINT
  // forwarded to the parent shell by Ctrl+C), kill the other and
  // exit with the same code. Avoids zombie processes when one half
  // crashes — the other isn't useful alone.
  const shutdown = (code: number | null) => {
    api.kill();
    web.kill();
    process.exit(code ?? 0);
  };
  api.on("exit", shutdown);
  web.on("exit", shutdown);
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  // Best-effort browser open after a small delay so Vite has time to
  // print its "ready in Nms" banner first. Skipping when --no-open.
  if (args.open) {
    setTimeout(() => openBrowser(`http://localhost:${args.webPort}`), 1200);
  }

  // Stay alive — children inherit stdio so they print directly.
  await new Promise<void>(() => {});
}

async function resolveStudioRoot(): Promise<string> {
  // Walk up from this file (in cli/src/commands) to packages/, then
  // into studio. Avoids bundler.url tricks; the monorepo layout is
  // stable enough to hardcode.
  const here = path.dirname(fileURLToPath(import.meta.url));
  // commands/ → src/ → cli/ → packages/ → packages/studio
  return path.resolve(here, "..", "..", "..", "studio");
}

function openBrowser(url: string): void {
  // macOS uses `open`, Linux `xdg-open`, Windows `start`. Best-effort:
  // failures are silent because the user can always click the URL in
  // their terminal.
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* best-effort */
  }
}
