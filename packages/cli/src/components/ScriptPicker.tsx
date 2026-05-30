import React from "react";
import { Box, Text } from "ink";
import type { ScriptInfo } from "@rpg-harness/engine";

interface ScriptPickerProps {
  completedId: string | null;
  options: ScriptInfo[];
  cursor: number;
}

export function ScriptPicker({ completedId, options, cursor }: ScriptPickerProps) {
  return (
    <Box flexDirection="column">
      {completedId ? (
        <Text color="green">✓ 完成台本：{completedId}</Text>
      ) : null}
      <Box marginTop={completedId ? 1 : 0}>
        <Text color="yellow">下一段：</Text>
      </Box>
      {options.map((opt, i) => {
        const selected = i === cursor;
        return (
          <Text
            key={opt.id}
            color={selected ? "cyan" : undefined}
            bold={selected}
          >
            {selected ? "▸ " : "  "}
            {`${i + 1}. ${opt.title}`}{" "}
            <Text dimColor>[{opt.id}]</Text>
          </Text>
        );
      })}
    </Box>
  );
}
