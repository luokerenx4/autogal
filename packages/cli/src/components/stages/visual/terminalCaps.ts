// Terminal color capability detection. Used by the TUI to decide
// whether tui.ans (truecolor SGR-laden output from chafa) will render
// cleanly, or whether to fall back to tui.txt / placeholder.
//
// We DIY the env-var check instead of pulling in `supports-color` —
// the logic is 30 lines, the dep tree is well-known, and we want
// hard control over what counts as "color present" in CI / dumb-tty
// scenarios where blindly trusting the dep's heuristics has bitten
// other TUI tools.
//
// The level returned is advisory: the TUI's selectRendering uses it
// only to gate `tui.ans`. Once a renderer has decided to use `.ans`,
// the actual escapes are passed through to the terminal verbatim —
// we don't downsample SGR codes ourselves. Truecolor escapes on a
// 256-color terminal degrade gracefully (the terminal picks the
// nearest palette entry) so we don't bother with intermediate tiers
// beyond "color is on / off".

export type ColorLevel = "truecolor" | "256" | "16" | "none";

// Resolve once at module load. Color support doesn't change mid-
// session — the env vars that signal it are read by the shell at
// fork time. Tests that need to vary this can re-import after
// setting env, but production code calls getColorLevel() and gets
// the cached answer for free on every Stage render.
let cached: ColorLevel | undefined;

export function getColorLevel(): ColorLevel {
  if (cached === undefined) cached = detect();
  return cached;
}

// Exported for tests. Production code uses getColorLevel().
export function detect(): ColorLevel {
  const env = process.env;

  // NO_COLOR is a community convention (no-color.org): any non-empty
  // value means "don't emit color". We honor it even on terminals
  // that would otherwise support color — that's the whole point.
  if (typeof env.NO_COLOR === "string" && env.NO_COLOR.length > 0) {
    return "none";
  }
  // FORCE_COLOR=0 is the inverse opt-out (chalk-style). Treat it
  // the same as NO_COLOR; FORCE_COLOR=1/2/3 are opt-ins covered below.
  if (env.FORCE_COLOR === "0") return "none";

  // FORCE_COLOR>=3 or =true forces truecolor (chalk convention).
  if (env.FORCE_COLOR === "3" || env.FORCE_COLOR === "true") {
    return "truecolor";
  }
  if (env.FORCE_COLOR === "2") return "256";
  if (env.FORCE_COLOR === "1") return "16";

  // Dumb terminals (CI logs, some pipe scenarios) explicitly opt out.
  if (env.TERM === "dumb") return "none";

  // Most modern terminals (iTerm2, Ghostty, Kitty, WezTerm, Alacritty,
  // VS Code, recent Terminal.app) advertise truecolor via COLORTERM.
  // The canonical values are "truecolor" and "24bit"; some terminals
  // set "yes" or other non-empty strings — be lenient.
  const colorterm = env.COLORTERM;
  if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";

  // TERM=*-256color is the conventional signal for the xterm 256
  // palette. Common values: xterm-256color, screen-256color,
  // tmux-256color.
  if (typeof env.TERM === "string" && env.TERM.includes("256color")) {
    return "256";
  }

  // Anything else: basic 16-color ANSI. This is the universal
  // baseline — every terminal capable of running a TUI supports it.
  return "16";
}

// Test helper: reset the cache so re-detection picks up new env.
// Production code doesn't need this; only the unit tests do.
export function resetColorLevelCache(): void {
  cached = undefined;
}
