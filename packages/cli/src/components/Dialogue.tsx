import React from "react";
import { Box, Text } from "ink";

interface DialogueProps {
  speakerName: string;
  text: string;
}

export function Dialogue({ speakerName, text }: DialogueProps) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {speakerName}
      </Text>
      <Text>「{text}」</Text>
    </Box>
  );
}
