import { loadGame } from "../loader";

interface Args {
  gameDir: string;
  missing: boolean;
  format: "table" | "json";
}

interface AssetRow {
  path: string;
  kind: string;
  ans: boolean;
  txt: boolean;
  source: boolean;
  web: boolean;
  placeholder: string;
}

// `autogal assets list [--missing] [--format json]`
//
// Surfaces the asset manifest for a game so an author (or AI helper)
// can see which slots still need art. With --missing, narrows to
// "spec exists, no TUI rendering committed" — the worklist for the
// next round of generation. The whole point of the asset system is
// to make this list reviewable in PRs without binary diffs; this
// command is just the convenient query view.
export async function assetsListCommand(args: Args): Promise<void> {
  const game = await loadGame(args.gameDir);
  const all: AssetRow[] = (game.assets ?? []).map((a) => ({
    path: a.path,
    kind: a.kind,
    ans: a.renderings.tuiAns !== undefined,
    txt: a.renderings.tuiTxt !== undefined,
    source: a.renderings.source !== undefined,
    web: a.renderings.web !== undefined,
    placeholder: a.placeholder,
  }));
  // "missing" = no TUI rendering present (no .ans, no .txt). Source
  // PNGs and web variants don't count as TUI-renderable — without a
  // text rendering the TUI must fall back to placeholder mode.
  const rows = args.missing ? all.filter((r) => !r.ans && !r.txt) : all;

  if (args.format === "json") {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  if (rows.length === 0) {
    process.stdout.write(
      args.missing
        ? "All assets have at least one TUI rendering.\n"
        : "No assets declared.\n",
    );
    return;
  }

  // Compact human-readable table. Padded path column makes the
  // status flags align without pulling in a table-formatting dep.
  const pathWidth = Math.max(
    "PATH".length,
    ...rows.map((r) => r.path.length),
  );
  const kindWidth = Math.max("KIND".length, ...rows.map((r) => r.kind.length));
  const header = `${pad("PATH", pathWidth)}  ${pad(
    "KIND",
    kindWidth,
  )}  ANS  TXT  SRC  WEB  PLACEHOLDER`;
  process.stdout.write(header + "\n");
  process.stdout.write("─".repeat(header.length) + "\n");
  for (const r of rows) {
    process.stdout.write(
      [
        pad(r.path, pathWidth),
        pad(r.kind, kindWidth),
        mark(r.ans),
        mark(r.txt),
        mark(r.source),
        mark(r.web),
        truncate(r.placeholder, 60),
      ].join("  ") + "\n",
    );
  }
  process.stdout.write(
    `\n${rows.length} asset${rows.length === 1 ? "" : "s"}${
      args.missing ? " missing TUI renderings" : ""
    }.\n`,
  );
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function mark(b: boolean): string {
  return b ? " ✓ " : " · ";
}

function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return s.slice(0, w - 1) + "…";
}
