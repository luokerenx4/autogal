import React from "react";
import { Box } from "ink";
import type { ScriptInfo } from "@rpg-harness/engine";
import { ScriptPicker } from "../ScriptPicker";

interface Props {
  completedId: string | null;
  nextAvailable: ScriptInfo[];
  cursor: number;
}

export function ScriptCompleteStage({ completedId, nextAvailable, cursor }: Props) {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      paddingX={4}
    >
      <ScriptPicker
        completedId={completedId}
        options={nextAvailable}
        cursor={cursor}
      />
    </Box>
  );
}
