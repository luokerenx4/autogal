import React from "react";
import { Box } from "ink";
import type { HubSnapshot } from "@rpg-harness/engine";
import { HubMenu } from "../HubMenu";

interface Props {
  snapshot: HubSnapshot;
  cursor: number;
}

export function HubMenuStage({ snapshot, cursor }: Props) {
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      <HubMenu snapshot={snapshot} cursor={cursor} />
    </Box>
  );
}
