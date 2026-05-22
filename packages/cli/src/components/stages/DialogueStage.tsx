import React from "react";
import { Box, Text } from "ink";

interface Props {
  speakerName: string;
  text: string;
}

export function DialogueStage({ speakerName, text }: Props) {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      paddingX={4}
    >
      <Text bold color="cyan">
        {speakerName}
      </Text>
      <Box marginTop={1}>
        <Text>「{text}」</Text>
      </Box>
    </Box>
  );
}
