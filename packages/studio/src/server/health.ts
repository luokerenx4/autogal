// Detect tools the studio's write operations depend on. Today that's
// only chafa (for source.quality.png → tui.txt rendering); cached at server
// boot so /api/health is a cheap lookup. If we ever ship other
// "optional but recommended" tools (ffmpeg for audio, imagemagick
// for thumbnails) they'd slot in here alongside chafa.
//
// Detection strategy: `chafa --version` exit code 0 + stdout parse.
// We don't probe at every render-tui call because chafa's presence
// doesn't change during a session — the user installing chafa
// mid-run can restart the studio. The UI's "install chafa" tooltip
// reads from this cached state.

export interface ToolCheck {
  present: boolean;
  // Reported version string when `present` is true. Format depends on
  // the tool ("Chafa version 1.18.2") — surfaced verbatim in the UI.
  version?: string;
  // Absolute path the binary was resolved to (`which chafa`). Useful
  // when diagnosing PATH issues remotely.
  path?: string;
}

export interface HealthState {
  chafa: ToolCheck;
}

let cached: HealthState | undefined;

export async function getHealth(): Promise<HealthState> {
  if (cached) return cached;
  cached = { chafa: await detectChafa() };
  return cached;
}

// Force a re-detect (currently unused by handlers; reserved for a
// future "rescan tools" UI button or a SIGHUP).
export function resetHealth(): void {
  cached = undefined;
}

async function detectChafa(): Promise<ToolCheck> {
  const path = await whichTool("chafa");
  if (!path) return { present: false };
  const version = await readVersion(path);
  return {
    present: true,
    path,
    ...(version !== undefined ? { version } : {}),
  };
}

// `which <bin>` — returns first-on-PATH absolute path or undefined.
// We shell out via Bun.spawn rather than walking PATH ourselves so
// we honor zsh aliases and shell-builtin `which` exactly the same
// way an interactive user would.
async function whichTool(bin: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(["which", bin], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(proc.stdout).text();
    const exit = await proc.exited;
    if (exit !== 0) return undefined;
    const p = out.trim();
    return p.length > 0 ? p : undefined;
  } catch {
    return undefined;
  }
}

async function readVersion(bin: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn([bin, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    // chafa prints "Chafa version 1.18.2\n..." on stdout. Other tools
    // sometimes write to stderr — concatenate to cover both.
    const text = (stdout + stderr).trim();
    const firstLine = text.split("\n")[0];
    return firstLine && firstLine.length > 0 ? firstLine : undefined;
  } catch {
    return undefined;
  }
}
