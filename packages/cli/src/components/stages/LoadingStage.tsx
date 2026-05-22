import React from "react";
import { Box, Text } from "ink";

export function LoadingStage() {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      <Text color="gray">loading…</Text>
    </Box>
  );
}
