import React from "react";
import { Box } from "ink";
import type { ScriptInfo } from "@autogal/engine";
import { ScriptPicker } from "../ScriptPicker";

interface Props {
  completedId: string | null;
  nextAvailable: ScriptInfo[];
}

export function ScriptCompleteStage({ completedId, nextAvailable }: Props) {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      paddingX={4}
    >
      <ScriptPicker completedId={completedId} options={nextAvailable} />
    </Box>
  );
}
