import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { GameLayout } from "./GameLayout";

export type InGameMenuAction = "continue" | "hub" | "quit";

interface Props {
  sessionName: string;
  onAction: (action: InGameMenuAction) => void;
}

const ITEMS: Array<{ label: string; action: InGameMenuAction }> = [
  { label: "继续游戏", action: "continue" },
  { label: "回到主菜单", action: "hub" },
  { label: "退出 RPG-Harness", action: "quit" },
];

export function InGameMenu({ sessionName, onAction }: Props) {
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onAction("continue");
      return;
    }
    if (key.upArrow || input === "k") setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow || input === "j")
      setSelected((s) => Math.min(ITEMS.length - 1, s + 1));
    if (key.return) {
      const item = ITEMS[selected];
      if (item) onAction(item.action);
    }
  });

  const header = (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>暂停</Text>
      <Text dimColor>存档: {sessionName} · 已自动保存</Text>
    </Box>
  );
  const footer = (
    <Box paddingX={2}>
      <Text dimColor>↑↓ 选择 · Enter 确认 · Esc 继续游戏</Text>
    </Box>
  );
  return (
    <GameLayout header={header} footer={footer}>
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        {ITEMS.map((item, i) => (
          <Text
            key={i}
            color={selected === i ? "cyan" : undefined}
            bold={selected === i}
          >
            {selected === i ? "▸ " : "  "}
            {item.label}
          </Text>
        ))}
      </Box>
    </GameLayout>
  );
}
