import React from "react";
import { Box, Text } from "ink";
import type { Output } from "@autogal/engine";

interface HintProps {
  output: Output;
  suffix?: string;
}

export function Hint({ output, suffix }: HintProps) {
  const hint = hintFor(output);
  if (!hint && !suffix) return null;
  const parts = [hint, suffix].filter(Boolean) as string[];
  return (
    <Box paddingX={1}>
      <Text dimColor>{parts.join(" · ")}</Text>
    </Box>
  );
}

function hintFor(output: Output): string | null {
  switch (output.type) {
    case "narration":
    case "dialogue":
    case "clear":
      return "Enter/空格 继续";
    case "choice":
      return "按数字选择";
    case "scriptComplete":
      return "按数字选择下一段";
    case "hubMenu":
      return "按数字选活动";
    case "gameEnd":
      return null;
  }
}
