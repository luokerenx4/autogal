import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Chafa's `--symbols` whitelist. Source of truth for both the
// server-side validator and the client-side dropdown — bumping this
// adds the option to both surfaces in one diff.
//
// Density (effective pixels per character cell):
//   block / half / vhalf / hhalf  — 1×2 or 2×1
//   quad                          — 2×2
//   sextant                       — 2×3
//   braille / octant              — 2×4
//   ascii                         — coarse, terminal-safe
//   all                           — chafa picks; widest glyph repertoire
export const ALLOWED_SYMBOLS = [
  "block",
  "half",
  "vhalf",
  "hhalf",
  "quad",
  "sextant",
  "braille",
  "octant",
  "ascii",
  "all",
] as const;
export type SymbolSet = (typeof ALLOWED_SYMBOLS)[number];

export const ALLOWED_DITHER = ["none", "ordered", "diffusion"] as const;
export type DitherMode = (typeof ALLOWED_DITHER)[number];

export interface RenderArgs {
  sourcePath: string;
  outDir: string;
  // From spec.sizeHint.tui when caller doesn't override. When BOTH
  // are present we pass --size to chafa; otherwise chafa picks its
  // own (terminal-derived) size, which is usually too big for
  // committing as an asset.
  sizeCols?: number;
  sizeRows?: number;
  // Caller-supplied chafa knobs. All optional with sensible defaults
  // matching v2's behavior so a caller passing nothing gets the
  // same rendering as before this commit.
  symbols?: SymbolSet;
  dither?: DitherMode;
}

// Shell out to chafa to produce a `tui.txt` rendering of source.png.
// Written to `outDir/tui.txt` atomically (tmp + rename) so a partial
// chafa run never leaves a torn file the running TUI would pick up
// via hot-reload mid-write.
//
// Stays monochrome (`--colors none`) — colored renderings belong in
// `tui.ans`, deferred. The symbol-set choice is what currently
// drives perceptible quality; the v2 follow-up exposed it as a knob
// because the default (`block`, 1×2 effective density) loses too
// much detail on typical portrait/CG content.
export async function renderSourceToTuiTxt(args: RenderArgs): Promise<void> {
  const out = path.join(args.outDir, "tui.txt");
  const tmp = out + ".tmp";

  const chafaArgs = [
    "--format",
    "symbols",
    "--symbols",
    args.symbols ?? "block",
    "--colors",
    "none",
    "--dither",
    args.dither ?? "none",
  ];
  if (
    typeof args.sizeCols === "number" &&
    typeof args.sizeRows === "number"
  ) {
    chafaArgs.push("--size", `${args.sizeCols}x${args.sizeRows}`);
  }
  chafaArgs.push(args.sourcePath);

  const proc = Bun.spawn(["chafa", ...chafaArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  if (exit !== 0) {
    throw new Error(
      `chafa exited ${exit}${stderr ? ": " + stderr.trim() : ""}`,
    );
  }
  if (stdout.length === 0) {
    throw new Error("chafa produced empty output");
  }

  await writeFile(tmp, stdout);
  await rename(tmp, out).catch(async (err) => {
    await unlink(tmp).catch(() => {});
    throw err;
  });
}

// Validate a parsed request body against the allowed symbol/dither
// whitelists and number invariants. Returns either a normalized
// RenderOptions object OR a string error. Caller-supplied fields
// are optional; absent fields become undefined and the renderer
// falls back to its defaults / spec.sizeHint.
export interface RenderOptions {
  symbols?: SymbolSet;
  cols?: number;
  rows?: number;
  dither?: DitherMode;
}

export function parseRenderOptions(
  raw: unknown,
): { options: RenderOptions } | { error: string } {
  if (raw === undefined || raw === null) return { options: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const out: RenderOptions = {};

  if (obj.symbols !== undefined) {
    if (
      typeof obj.symbols !== "string" ||
      !(ALLOWED_SYMBOLS as readonly string[]).includes(obj.symbols)
    ) {
      return {
        error: `symbols must be one of: ${ALLOWED_SYMBOLS.join(", ")}`,
      };
    }
    out.symbols = obj.symbols as SymbolSet;
  }

  if (obj.dither !== undefined) {
    if (
      typeof obj.dither !== "string" ||
      !(ALLOWED_DITHER as readonly string[]).includes(obj.dither)
    ) {
      return {
        error: `dither must be one of: ${ALLOWED_DITHER.join(", ")}`,
      };
    }
    out.dither = obj.dither as DitherMode;
  }

  if (obj.cols !== undefined) {
    if (typeof obj.cols !== "number" || !Number.isInteger(obj.cols) || obj.cols < 1 || obj.cols > 500) {
      return { error: "cols must be an integer 1..500" };
    }
    out.cols = obj.cols;
  }
  if (obj.rows !== undefined) {
    if (typeof obj.rows !== "number" || !Number.isInteger(obj.rows) || obj.rows < 1 || obj.rows > 500) {
      return { error: "rows must be an integer 1..500" };
    }
    out.rows = obj.rows;
  }

  return { options: out };
}
