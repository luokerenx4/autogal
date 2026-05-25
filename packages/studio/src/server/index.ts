// Studio backend. Plain Bun.serve — no Express, no framework. The
// surface is small (a handful of GET endpoints reading game data
// off disk + a couple of static file serves) and the runtime is
// already bun, so a framework would be pure overhead.
//
// v1 is read-only: nothing here mutates the game directory. Write
// operations (upload, chafa render) belong to v2 and will live
// alongside these handlers.

import path from "node:path";
import { loadGame } from "@autogal/cli/loader";
import { handle } from "./handlers";

interface StartArgs {
  gameDir: string;
  port: number;
}

export async function startStudioServer(args: StartArgs): Promise<{
  port: number;
  url: string;
  stop: () => void;
}> {
  const gameDir = path.resolve(args.gameDir);

  // Eager-load once on boot to catch config errors before opening the
  // browser. The handler caches the Game in-memory and re-reads from
  // disk on every /api/game so the gallery reflects live spec edits
  // without us building a watch+invalidate pipeline in v1.
  await loadGame(gameDir);

  const server = Bun.serve({
    port: args.port,
    async fetch(req) {
      try {
        return await handle(req, { gameDir });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  // server.port is typed as `number | undefined` in Bun's defs since
  // a unix-socket listener has no port, but we always pass a numeric
  // port above so the runtime value is guaranteed to be defined.
  const port = server.port ?? args.port;
  return {
    port,
    url: `http://localhost:${port}`,
    stop: () => server.stop(),
  };
}

// Allow `bun run src/server/index.ts <gameDir>` for quick dev driving
// without going through the CLI entry. The CLI command wraps this
// with browser-open + Vite spawning; this path is the bare server.
if (import.meta.main) {
  const gameDir = process.argv[2];
  if (!gameDir) {
    process.stderr.write("Usage: bun src/server/index.ts <game-dir>\n");
    process.exit(2);
  }
  const port = Number(process.env.STUDIO_API_PORT ?? 4174);
  const { url } = await startStudioServer({ gameDir, port });
  process.stdout.write(`studio api: ${url}\n`);
}
