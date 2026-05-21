import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { GameCandidate } from "../games";

interface GamePickerProps {
  candidates: GameCandidate[];
  onSelect: (c: GameCandidate | null) => void;
}

export function GamePicker({ candidates, onSelect }: GamePickerProps) {
  const { exit } = useApp();
  const [selected, setSelected] = useState(0);
  const itemCount = candidates.length + 1; // +1 for quit row

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(itemCount - 1, s + 1));
    }
    if (key.return) {
      if (selected === candidates.length) onSelect(null);
      else onSelect(candidates[selected] ?? null);
      exit();
    }
    if (input === "q") {
      onSelect(null);
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>autogal · 选一个游戏</Text>
        <Text dimColor>shell-native GalGame</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {candidates.map((c, i) => {
          const isSel = selected === i;
          return (
            <Box key={c.dir}>
              <Text color={isSel ? "cyan" : undefined} bold={isSel}>
                {isSel ? "▸ " : "  "}
                {c.title}
              </Text>
              <Text dimColor>  {c.relPath}</Text>
            </Box>
          );
        })}
        <Text
          color={selected === candidates.length ? "cyan" : undefined}
          bold={selected === candidates.length}
        >
          {selected === candidates.length ? "▸ " : "  "}退出
        </Text>
      </Box>
      <Box marginTop={2}>
        <Text dimColor>↑↓/jk 选择 · Enter 确认 · q 退出</Text>
      </Box>
    </Box>
  );
}
