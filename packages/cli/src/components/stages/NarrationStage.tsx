import React from "react";
import { Box, Text } from "ink";
import type { AssetSpec, VisualState } from "@rpg-harness/engine";
import { Stage } from "./visual/Stage";

interface Props {
  text: string;
  visuals: VisualState;
  assetMap: Map<string, AssetSpec>;
}

// Galgame narration layout: same stage area as dialogue, but the
// bottom box has no speaker chip — just the narration text in a
// bordered box. Visually distinct from dialogue (no cyan speaker
// banner) but keeps the same overall structure so the stage area
// doesn't reflow when narration interleaves with dialogue.
export function NarrationStage({ text, visuals, assetMap }: Props) {
  return (
    <Box flexGrow={1} flexDirection="column">
      <Stage visuals={visuals} assetMap={assetMap} />
      <Box
        flexShrink={0}
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={0}
        minHeight={5}
        justifyContent="center"
      >
        <Text>{text}</Text>
      </Box>
    </Box>
  );
}
