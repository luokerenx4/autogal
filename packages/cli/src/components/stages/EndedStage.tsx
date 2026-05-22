import React from "react";
import { Box, Text } from "ink";

interface Props {
  reason?: string;
}

export function EndedStage({ reason }: Props) {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      <Text color="gray">— 完 —</Text>
      {reason ? (
        <Box marginTop={1}>
          <Text dimColor>{reason}</Text>
        </Box>
      ) : null}
      <Box marginTop={2}>
        <Text dimColor>感谢游玩。按 Esc 回主菜单。</Text>
      </Box>
    </Box>
  );
}
