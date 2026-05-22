import React, { useEffect, useState } from "react";
import { Box, useStdout } from "ink";

// Fullscreen TUI shell. Every top-level screen renders inside one of
// these so frames stay anchored to the terminal viewport (no streaming
// into scrollback — that's what was breaking the play loop on macOS
// Terminal). Combined with the alt-screen entered in `play.ts`, this
// gives us a vim/less-style full-takeover surface.
//
// Layout: optional header (fixed height), stage (flexGrow=1, fills the
// rest), optional footer (fixed). Children = stage content. Header /
// footer come in via props.

interface Props {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function GameLayout({ header, footer, children }: Props) {
  const { rows, columns } = useTerminalSize();
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {header ? <Box flexShrink={0}>{header}</Box> : null}
      <Box flexGrow={1} flexShrink={1} flexDirection="column" overflow="hidden">
        {children}
      </Box>
      {footer ? <Box flexShrink={0}>{footer}</Box> : null}
    </Box>
  );
}

// useStdout exposes columns/rows but doesn't re-fire on SIGWINCH; ink's
// internal resize handling rerenders the root but a *child* reading
// stdout.columns won't get the new value unless it has its own state.
// This hook subscribes to the resize event and forces a re-read.
function useTerminalSize(): { rows: number; columns: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    rows: stdout.rows ?? 24,
    columns: stdout.columns ?? 80,
  }));
  useEffect(() => {
    const update = () => {
      setSize({ rows: stdout.rows ?? 24, columns: stdout.columns ?? 80 });
    };
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);
  return size;
}
