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
//   Default mode: bg + portrait. When the bg is just a placeholder
//     text, it renders as a one-line banner at the top and the
//     portrait sits below in the remaining space. When the bg has a
//     real rendering (tui.txt / tui.ans), it becomes a sized
//     backdrop — width/height come from spec.sizeHint.tui — and the
//     portrait sits beside it (row layout). This avoids the
//     "80x24 colored bg fills the entire stage and the dialogue box
//     gets squashed against the bottom" failure mode.
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

  const bgRendering = bgSpec ? selectRendering(bgSpec) : undefined;
  const bgIsReal =
    bgRendering !== undefined &&
    (bgRendering.kind === "ans" || bgRendering.kind === "txt");

  // Real bg → row layout (bg backdrop on the left, portrait right of
  // it). Placeholder bg → column layout (banner line on top, portrait
  // centered below). Different shapes because a real 80×24 bg sized
  // as a banner would steal half the stage; rendering it as a
  // sized backdrop next to the portrait keeps both visible.
  if (bgIsReal) {
    return (
      <Box flexGrow={1} flexDirection="row" paddingX={2} paddingY={1}>
        <BgBackdrop spec={bgSpec} path={visuals.bg!} />
        {visuals.portraits.center ? (
          <Box marginLeft={2}>
            <PortraitPanel
              spec={centerSpec}
              path={visuals.portraits.center}
            />
          </Box>
        ) : null}
      </Box>
    );
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

// One-line dim banner — used ONLY when the bg has no committed
// rendering yet (placeholder mode). Renders the spec's placeholder
// text in italic dim — visually subordinate so it reads as "scene
// label" not as the dominant content.
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

// Sized backdrop — used when bg has a real tui.txt or tui.ans.
// Width and height come from spec.sizeHint.tui (defaulting to a
// galgame-ish 80×24 when unset) so the rendering can't blow up
// the stage layout if the author authored a huge tui.ans.
//
// Critically: does NOT wrap the content in <Text dimColor>. For .ans
// content the SGR escapes already carry chafa's truecolor palette;
// layering ink's dim SGR on top corrupts the chafa output and
// produces the smeared/striped look the user reported on first use.
// .txt content stays un-dimmed too — it's the foreground "image"
// now, not a placeholder.
function BgBackdrop({
  spec,
  path,
}: {
  spec: AssetSpec | undefined;
  path: string;
}) {
  const rendering = selectRendering(spec);
  const cols = spec?.sizeHint?.tui?.cols ?? 80;
  const rows = spec?.sizeHint?.tui?.rows ?? 24;
  const dev = process.env.AUTOGAL_DEV === "1";
  return (
    <Box flexDirection="column" width={cols} height={rows} flexShrink={0}>
      {dev ? (
        <Text dimColor color="yellow">
          [bg: {path}]
        </Text>
      ) : null}
      {rendering.kind === "ans" || rendering.kind === "txt" ? (
        // wrap="truncate-end" prevents ink from re-wrapping long
        // chafa rows when the parent terminal is narrower than the
        // spec; the bg just gets clipped on the right rather than
        // reflowing into a glitchy stripe pattern.
        <Text wrap="truncate-end">{rendering.content}</Text>
      ) : (
        <RenderingText rendering={rendering} />
      )}
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
