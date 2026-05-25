import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetSpec } from "@autogal/engine";
import { loadGame } from "@autogal/cli/loader";

interface Ctx {
  gameDir: string;
}

// Dispatch by URL path. Tiny hand-rolled router — Bun.serve doesn't
// ship with one and adding express/hono for ~6 routes is overkill.
// Order matters only for the prefix-match handlers (/api/assets/...
// vs /api/assets); checked from most-specific to least.
export async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;

  if (pathname === "/api/game") return getGame(ctx);
  if (pathname === "/api/assets") return getAssets(ctx);

  // /api/assets/<asset-path>   (asset-path may itself contain slashes)
  const specMatch = pathname.match(/^\/api\/assets\/(.+)$/);
  if (specMatch && specMatch[1]) return getAssetSpec(ctx, specMatch[1]);

  // Raw bytes for renderings, served straight off disk. Paths in the
  // URL are asset paths (e.g. "assets/portraits/kagari-smile") + a
  // suffix indicating which rendering. We deliberately do NOT accept
  // arbitrary fs paths here — only what an AssetSpec.renderings field
  // resolves to.
  const fileMatch = pathname.match(
    /^\/files\/(source|tui-txt|tui-ans|web)\/(.+)$/,
  );
  if (fileMatch && fileMatch[1] && fileMatch[2]) {
    return getFile(ctx, fileMatch[1], fileMatch[2]);
  }

  return new Response("not found", { status: 404 });
}

async function getGame(ctx: Ctx): Promise<Response> {
  const game = await loadGame(ctx.gameDir);
  return json({
    title: game.title,
    counts: {
      characters: game.characters.length,
      scripts: game.scripts.length,
      assets: (game.assets ?? []).length,
    },
    gameDir: ctx.gameDir,
  });
}

async function getAssets(ctx: Ctx): Promise<Response> {
  const game = await loadGame(ctx.gameDir);
  // Mirror the AssetSpec shape but flatten `renderings` into a
  // simple availability map — the web client doesn't need absolute
  // file paths (those are server-internal). For actual bytes, the
  // client GETs /files/<slot>/<asset-path>.
  const rows = (game.assets ?? []).map((a) => projectAsset(a));
  return json(rows);
}

async function getAssetSpec(ctx: Ctx, assetPath: string): Promise<Response> {
  const game = await loadGame(ctx.gameDir);
  const spec = (game.assets ?? []).find((a) => a.path === assetPath);
  if (!spec) return json({ error: "asset not found" }, 404);
  return json(projectAsset(spec));
}

function projectAsset(a: AssetSpec) {
  return {
    path: a.path,
    kind: a.kind,
    description: a.description,
    prompt: a.prompt,
    placeholder: a.placeholder,
    ...(a.styleRef !== undefined ? { styleRef: a.styleRef } : {}),
    ...(a.refs !== undefined ? { refs: a.refs } : {}),
    ...(a.sizeHint !== undefined ? { sizeHint: a.sizeHint } : {}),
    ...(a.tags !== undefined ? { tags: a.tags } : {}),
    renderings: {
      source: a.renderings.source !== undefined,
      tuiTxt: a.renderings.tuiTxt !== undefined,
      tuiAns: a.renderings.tuiAns !== undefined,
      web: a.renderings.web !== undefined,
    },
  };
}

async function getFile(
  ctx: Ctx,
  slot: string,
  assetPath: string,
): Promise<Response> {
  const game = await loadGame(ctx.gameDir);
  const spec = (game.assets ?? []).find((a) => a.path === assetPath);
  if (!spec) return new Response("asset not found", { status: 404 });

  // Resolve slot → the absolute path the loader discovered. We trust
  // ONLY these paths — never construct a path from the URL ourselves.
  // That keeps the slot-vs-path-traversal attack surface zero.
  const abs = slotPath(spec, slot);
  if (!abs) return new Response("rendering not present", { status: 404 });

  // Defense in depth: even though the path came from a spec the
  // server itself loaded, refuse anything outside gameDir. A malicious
  // spec.yaml with `tui_txt: ../../../../etc/passwd` would otherwise
  // be reachable; the loader currently doesn't validate paths beyond
  // the spec dir but it's cheap to guard here.
  const rel = path.relative(ctx.gameDir, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new Response("forbidden", { status: 403 });
  }

  const bytes = await readFile(abs);
  return new Response(bytes, {
    headers: { "content-type": mimeFor(abs) },
  });
}

function slotPath(
  spec: AssetSpec,
  slot: string,
): string | undefined {
  if (slot === "source") return spec.renderings.source;
  if (slot === "tui-txt") return spec.renderings.tuiTxt;
  if (slot === "tui-ans") return spec.renderings.tuiAns;
  if (slot === "web") return spec.renderings.web;
  return undefined;
}

function mimeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".txt" || ext === ".ans") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
