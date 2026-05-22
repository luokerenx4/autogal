import React from "react";
import { Box } from "ink";
import type { HubSnapshot } from "@autogal/engine";
import { HubMenu } from "../HubMenu";

interface Props {
  snapshot: HubSnapshot;
}

export function HubMenuStage({ snapshot }: Props) {
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      <HubMenu snapshot={snapshot} />
    </Box>
  );
}
