import React from "react";
import { Box, Text } from "ink";
import type { ScriptInfo } from "@autogal/engine";

interface ScriptPickerProps {
  completedId: string | null;
  options: ScriptInfo[];
}

export function ScriptPicker({ completedId, options }: ScriptPickerProps) {
  return (
    <Box flexDirection="column">
      {completedId ? (
        <Text color="green">✓ 完成台本：{completedId}</Text>
      ) : null}
      <Box marginTop={completedId ? 1 : 0}>
        <Text color="yellow">下一段：</Text>
      </Box>
      {options.map((opt, i) => (
        <Text key={opt.id}>
          {`  ${i + 1}. ${opt.title}`}{" "}
          <Text color="gray">[{opt.id}]</Text>
        </Text>
      ))}
    </Box>
  );
}
