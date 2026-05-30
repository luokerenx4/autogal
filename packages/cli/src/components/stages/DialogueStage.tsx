import React from "react";
import { Box, Text } from "ink";
import type { AssetSpec, VisualState } from "@rpg-harness/engine";
import { Stage } from "./visual/Stage";

interface Props {
  speakerName: string;
  text: string;
  visuals: VisualState;
  assetMap: Map<string, AssetSpec>;
}

// Galgame layout: stage area on top (bg + portraits, or full-screen CG)
// + bordered dialogue box on the bottom. The dialogue box has a fixed
// minimum height so the layout doesn't jitter between short and long
// speaker turns; the stage area absorbs the remaining vertical space.
export function DialogueStage({
  speakerName,
  text,
  visuals,
  assetMap,
}: Props) {
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
      >
        <Text bold color="cyan">
          {speakerName}
        </Text>
        <Box marginTop={1}>
          <Text>「{text}」</Text>
        </Box>
      </Box>
    </Box>
  );
}
