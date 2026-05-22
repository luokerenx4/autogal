import React from "react";
import { Box, Text } from "ink";

interface Props {
  text: string;
}

export function NarrationStage({ text }: Props) {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      paddingX={4}
    >
      <Text>{text}</Text>
    </Box>
  );
}
