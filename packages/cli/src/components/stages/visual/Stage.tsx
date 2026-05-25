import React from "react";
import { Box, Text } from "ink";
import type { AssetSpec, VisualState } from "@autogal/engine";
import { selectRendering, type Rendering } from "./assetRender";

interface Props {
  visuals: VisualState;
  assetMap: Map<string, AssetSpec>;
}

// Galgame-style stage area. Three layers, but with terminal-friendly
// composition (no absolute positioning, which is flaky in ink):
//
//   CG mode (visuals.cg !== null): the CG takes over the whole stage,
//     centered. Backgrounds and portraits are hidden — same convention
//     as RPG Maker / Ren'Py.
//
//   Default mode: a small bg banner at the top (placeholder text or
//     pre-rendered tui.txt content, rendered dim) + portrait slots
//     stacked horizontally below it. Portrait content lives in a
//     bordered box on the right; future left/right slots will sit
//     beside it.
//
// Empty stage (no bg, no portraits, no cg) renders as a thin "stage
// empty" hint in dim text so the layout doesn't collapse — useful
// during early authoring before any spec.yaml exists.
export function Stage({ visuals, assetMap }: Props) {
  if (visuals.cg) {
    const spec = assetMap.get(visuals.cg);
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center" padding={1}>
        <CgPanel spec={spec} path={visuals.cg} />
      </Box>
    );
  }

  const bgSpec = visuals.bg ? assetMap.get(visuals.bg) : undefined;
  const centerSpec = visuals.portraits.center
    ? assetMap.get(visuals.portraits.center)
    : undefined;
  const isEmpty =
    !visuals.bg &&
    Object.values(visuals.portraits).every((p) => !p);

  if (isEmpty) {
    return <Box flexGrow={1} />;
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      {visuals.bg ? (
        <BgBanner spec={bgSpec} path={visuals.bg} />
      ) : null}
      <Box flexGrow={1} flexDirection="row" justifyContent="flex-end" marginTop={1}>
        {visuals.portraits.center ? (
          <PortraitPanel spec={centerSpec} path={visuals.portraits.center} />
        ) : null}
      </Box>
    </Box>
  );
}

// One-line dim banner. When a tui rendering exists, prefer it (still
// dimmed so it reads as backdrop, not foreground); otherwise show the
// placeholder text. Truncation is left to ink's natural wrapping —
// authors who care about width set size_hint.tui.cols in the spec.
function BgBanner({
  spec,
  path,
}: {
  spec: AssetSpec | undefined;
  path: string;
}) {
  const rendering = selectRendering(spec);
  return (
    <Box flexDirection="column">
      {process.env.AUTOGAL_DEV === "1" ? (
        <Text dimColor color="yellow">
          [bg: {path}]
        </Text>
      ) : null}
      <RenderingText rendering={rendering} dim />
    </Box>
  );
}

// Right-anchored bordered portrait panel. Width is roughly the spec's
// tui size_hint (defaults match the existing kagari-smile example);
// the border + dim metadata frame the asset so missing-rendering vs
// present-rendering visually differs without changing layout.
function PortraitPanel({
  spec,
  path,
}: {
  spec: AssetSpec | undefined;
  path: string;
}) {
  const rendering = selectRendering(spec);
  const cols = spec?.sizeHint?.tui?.cols ?? 32;
  const dev = process.env.AUTOGAL_DEV === "1";
  const isPlaceholder = rendering.kind === "placeholder";
  return (
    <Box
      flexDirection="column"
      borderStyle={isPlaceholder ? "round" : undefined}
      borderColor={isPlaceholder ? "gray" : undefined}
      paddingX={isPlaceholder ? 1 : 0}
      width={cols + (isPlaceholder ? 4 : 0)}
    >
      {dev ? (
        <Text dimColor color="yellow">
          [portrait: {path}]
        </Text>
      ) : null}
      <RenderingText rendering={rendering} />
    </Box>
  );
}

// CG mode panel. Centered, max-width 80 to keep wide terminals from
// stretching ASCII art beyond legibility. Placeholder mode draws a
// dashed-border box so the "missing rendering" affordance is obvious;
// pre-rendered modes display the content unframed (galgame CGs
// classically have no frame — they ARE the screen).
function CgPanel({
  spec,
  path,
}: {
  spec: AssetSpec | undefined;
  path: string;
}) {
  const rendering = selectRendering(spec);
  const dev = process.env.AUTOGAL_DEV === "1";
  const isPlaceholder = rendering.kind === "placeholder";
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle={isPlaceholder ? "round" : undefined}
      borderColor={isPlaceholder ? "gray" : undefined}
      paddingX={isPlaceholder ? 2 : 0}
      paddingY={isPlaceholder ? 1 : 0}
    >
      {dev ? (
        <Text dimColor color="yellow">
          [cg: {path}]
        </Text>
      ) : null}
      <RenderingText rendering={rendering} />
    </Box>
  );
}

// Single text node that styles by rendering kind:
//   ans      → pass-through (already styled)
//   txt      → mono content, optionally dimmed when used as backdrop
//   placeholder → italic + dim — visually distinct from real art
//   missing  → red "(asset not found)" with the path
function RenderingText({
  rendering,
  dim,
}: {
  rendering: Rendering;
  dim?: boolean;
}) {
  if (rendering.kind === "missing") {
    return <Text color="red">(asset not found)</Text>;
  }
  if (rendering.kind === "placeholder") {
    return (
      <Text italic dimColor>
        {rendering.content}
      </Text>
    );
  }
  return <Text dimColor={dim}>{rendering.content}</Text>;
}
