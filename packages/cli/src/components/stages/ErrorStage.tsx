import React from "react";
import { Box, Text } from "ink";

interface Props {
  message: string;
  stack?: string;
}

export function ErrorStage({ message, stack }: Props) {
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="red" bold>
        启动失败:
      </Text>
      <Box marginTop={1}>
        <Text color="red">{message}</Text>
      </Box>
      {stack ? (
        <Box marginTop={1}>
          <Text dimColor>{stack}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
