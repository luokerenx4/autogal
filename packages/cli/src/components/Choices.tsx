import React from "react";
import { Box, Text } from "ink";
import type { RenderedChoice } from "@autogal/engine";

interface ChoicesProps {
  prompt?: string;
  options: RenderedChoice[];
}

export function Choices({ prompt, options }: ChoicesProps) {
  return (
    <Box flexDirection="column">
      {prompt ? <Text color="yellow">{prompt}</Text> : null}
      {options.map((opt, i) => (
        <Text
          key={i}
          color={opt.available ? "white" : "gray"}
          dimColor={!opt.available}
        >
          {`  ${i + 1}. ${opt.text}`}
          {opt.available ? "" : `  （${opt.lockedReason ?? "锁定"}）`}
        </Text>
      ))}
    </Box>
  );
}
