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

// chafa's `--colors` flag. We expose the four useful tiers + none:
//   none  — monochrome (writes to tui.txt)
//   16    — basic ANSI (terminal universally supports it)
//   256   — xterm 256-color palette
//   full  — 24-bit truecolor (requires a TRUECOLOR-aware terminal)
//
// When colors != none the output gets ANSI SGR escapes and lands in
// tui.ans; the TUI's selectRendering already prefers .ans over .txt
// so the new file takes over on next reload.
export const ALLOWED_COLORS = ["none", "16", "256", "full"] as const;
export type ColorMode = (typeof ALLOWED_COLORS)[number];

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
  // matching v2's original behavior so a caller passing nothing gets
  // the same rendering as before colors/dither were exposed.
  symbols?: SymbolSet;
  dither?: DitherMode;
  colors?: ColorMode;
}

export interface RenderResult {
  // Which file got written (tui.txt for monochrome, tui.ans for any
  // color mode). The caller propagates this back to the client so
  // the UI knows whether to render ANSI or plain text in its preview.
  outFile: "tui.txt" | "tui.ans";
}

// Shell out to chafa to produce a TUI rendering of source.quality.png.
// Output filename depends on the color mode — monochrome lands in
// `tui.txt`, anything colored in `tui.ans` (ANSI SGR escapes).
// Writes are atomic (tmp + rename) so a partial chafa run never
// leaves a torn file the running TUI would pick up via hot-reload
// mid-write.
//
// The function does NOT auto-clean the "other" file: rendering color
// after rendering mono leaves both tui.txt and tui.ans on disk. The
// TUI's selectRendering prefers .ans, so the latest render wins;
// authors who want a clean state can delete the unused file by hand.
export async function renderSourceToTui(args: RenderArgs): Promise<RenderResult> {
  const colors = args.colors ?? "none";
  const outFile: RenderResult["outFile"] = colors === "none" ? "tui.txt" : "tui.ans";
  const out = path.join(args.outDir, outFile);
  const tmp = out + ".tmp";

  const chafaArgs = [
    "--format",
    "symbols",
    "--symbols",
    args.symbols ?? "block",
    "--colors",
    colors,
    "--dither",
    args.dither ?? "none",
  ];
  if (
    typeof args.sizeCols === "number" &&
    typeof args.sizeRows === "number"
  ) {
    chafaArgs.push("--size", `${args.sizeCols}x${args.sizeRows}`);
  }
  // chafa's `--format symbols` is already SGR-only by default; the
  // earlier `--polite on` addition was speculative and turned out to
  // be a no-op for our usage. Cleaner to trust the defaults than to
  // carry a flag whose semantics drift between chafa versions.
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
  return { outFile };
}

// Back-compat alias for the original v2 name. Existing callers that
// don't care which file landed can keep using this; new callers
// take the {outFile} return value to know whether the .ans or .txt
// slot is now populated.
export const renderSourceToTuiTxt = renderSourceToTui;

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
  colors?: ColorMode;
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

  if (obj.colors !== undefined) {
    if (
      typeof obj.colors !== "string" ||
      !(ALLOWED_COLORS as readonly string[]).includes(obj.colors)
    ) {
      return {
        error: `colors must be one of: ${ALLOWED_COLORS.join(", ")}`,
      };
    }
    out.colors = obj.colors as ColorMode;
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
