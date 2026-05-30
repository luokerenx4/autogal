import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { GameCandidate } from "../games";
import { GameLayout } from "./GameLayout";

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

  const header = (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>RPG-Harness · 选一个游戏</Text>
      <Text dimColor>headless RPG Maker</Text>
    </Box>
  );
  const footer = (
    <Box paddingX={2}>
      <Text dimColor>↑↓/jk 选择 · Enter 确认 · q 退出</Text>
    </Box>
  );
  return (
    <GameLayout header={header} footer={footer}>
      <Box flexGrow={1} flexDirection="column" paddingX={2}>
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
    </GameLayout>
  );
}
