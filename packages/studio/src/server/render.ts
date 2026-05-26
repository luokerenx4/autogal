import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

interface RenderArgs {
  // Absolute path to the asset's source.png — the loader's already
  // verified its existence by the time we get here.
  sourcePath: string;
  // The asset's directory; tui.txt will land here.
  outDir: string;
  // From spec.sizeHint.tui — when both are present we pass --size
  // to chafa. Otherwise chafa picks its own (terminal-derived) size.
  sizeCols?: number;
  sizeRows?: number;
}

// Shell out to chafa to produce a `tui.txt` rendering of source.png.
// Written to `outDir/tui.txt` atomically (tmp + rename) so a partial
// chafa run never leaves a torn file that the next render-tui would
// surface or that the running TUI would pick up via hot-reload.
//
// We use --format symbols (block characters, monochrome) by default
// — `tui.ans` rather than `tui.txt` is the path for ANSI-color
// renderings, which a future iteration can add as a separate handler.
// For v2 we want one knob, not three, so authors don't have to
// choose; the colored variant comes when we ship `tui.ans`.
export async function renderSourceToTuiTxt(args: RenderArgs): Promise<void> {
  const out = path.join(args.outDir, "tui.txt");
  const tmp = out + ".tmp";

  const chafaArgs = ["--format", "symbols", "--colors", "none"];
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
