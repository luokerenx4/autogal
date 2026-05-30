import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Args {
  gameDir: string;
  apiPort: number;
  webPort: number;
  open: boolean;
}

// `rpgh studio <game-dir>` — boots the browser-based authoring
// workbench. Two subprocesses run in parallel:
//   1. Bun API server (packages/studio/src/server/index.ts) — reads
//      the game dir, serves /api/* and /files/*
//   2. Vite dev server — serves the React SPA with HMR, proxies the
//      two prefixes above to (1)
//
// The CLI just orchestrates: spawns both, forwards stdout/stderr,
// kills both on Ctrl+C. Both child ports are pre-discovered (find
// the first free port starting from the requested default) so a
// already-running dev server elsewhere doesn't block startup.
export async function studioCommand(args: Args): Promise<void> {
  // Studio package lives next to @rpg-harness/cli in the monorepo. We
  // resolve its path via the @rpg-harness/studio package — the same
  // technique the engine/parser packages use to import each other.
  const studioRoot = await resolveStudioRoot();
  const gameDir = path.resolve(args.gameDir);

  // Pre-allocate ports BEFORE spawning so vite/Bun.serve don't crash
  // when defaults are occupied (another Vite project, another rpgh
  // studio instance, whatever). Race with intervening processes is
  // theoretically possible but vanishingly rare; if it happens the
  // child will throw a clear error and the user re-runs.
  const apiPort = await findFreePort(args.apiPort);
  const webPort = await findFreePort(args.webPort, apiPort);
  if (apiPort !== args.apiPort) {
    process.stdout.write(
      `(api port ${args.apiPort} in use, falling back to ${apiPort})\n`,
    );
  }
  if (webPort !== args.webPort) {
    process.stdout.write(
      `(web port ${args.webPort} in use, falling back to ${webPort})\n`,
    );
  }

  const env = {
    ...process.env,
    STUDIO_API_PORT: String(apiPort),
    STUDIO_WEB_PORT: String(webPort),
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
    setTimeout(() => openBrowser(`http://localhost:${webPort}`), 1200);
  }

  // Stay alive — children inherit stdio so they print directly.
  await new Promise<void>(() => {});
}

// Scan upward from `start` for a free TCP port. Skips any port equal
// to `avoid` (used when allocating web port after api port to keep
// them distinct without re-querying). Searches up to 100 slots before
// giving up — if 100 consecutive ports are all taken something else
// is wrong with the system, not our problem to solve.
async function findFreePort(start: number, avoid?: number): Promise<number> {
  for (let p = start; p < start + 100; p++) {
    if (p === avoid) continue;
    if (await isPortFree(p)) return p;
  }
  throw new Error(
    `no free port in range [${start}, ${start + 100}) — close some processes and retry`,
  );
}

// A port is "free" iff BOTH IPv4 and IPv6 loopback are available.
// vite + Bun.serve default to `localhost`, which resolves to 127.0.0.1
// AND ::1; if a prior process bound only one (vite typically picks
// ::1 on modern Node), wildcard / IPv4-only probes false-positive the
// port as free. So probe both interfaces and require both to succeed.
async function isPortFree(port: number): Promise<boolean> {
  return (
    (await tryBind(port, "127.0.0.1")) && (await tryBind(port, "::1"))
  );
}

function tryBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
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
