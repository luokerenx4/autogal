import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Game } from "@rpg-harness/engine";
import { listSessionsWithMeta, type SessionMeta } from "../session";
import { GameLayout } from "./GameLayout";

export type HubAction =
  | { type: "play"; sessionName: string; isNew: boolean }
  | { type: "quit" };

interface HubScreenProps {
  game: Game;
  gameDir: string;
  onAction: (action: HubAction) => void;
}

export function HubScreen({ game, gameDir, onAction }: HubScreenProps) {
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    listSessionsWithMeta(gameDir).then(setSessions);
  }, [gameDir]);

  type Item =
    | { kind: "new" }
    | { kind: "continue"; session: SessionMeta }
    | { kind: "quit" };

  const items: Item[] = [
    { kind: "new" },
    ...(sessions ?? []).map((s) => ({ kind: "continue" as const, session: s })),
    { kind: "quit" },
  ];

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(items.length - 1, s + 1));
    }
    if (key.return) {
      const item = items[selected];
      if (!item) return;
      if (item.kind === "new") {
        const name = `play-${formatTimestamp()}`;
        onAction({ type: "play", sessionName: name, isNew: true });
      } else if (item.kind === "continue") {
        onAction({
          type: "play",
          sessionName: item.session.name,
          isNew: false,
        });
      } else if (item.kind === "quit") {
        onAction({ type: "quit" });
      }
    }
    if (input === "q") onAction({ type: "quit" });
  });

  const header = (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>{game.title}</Text>
      <Text dimColor>RPG-Harness · headless RPG Maker</Text>
    </Box>
  );
  const footer = (
    <Box paddingX={2}>
      <Text dimColor>↑↓/jk 选择 · Enter 确认 · q 退出</Text>
    </Box>
  );
  return (
    <GameLayout header={header} footer={footer}>
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        {items.map((item, i) => (
          <ItemRow key={i} item={item} selected={selected === i} />
        ))}
      </Box>
    </GameLayout>
  );
}

interface ItemRowProps {
  item:
    | { kind: "new" }
    | { kind: "continue"; session: SessionMeta }
    | { kind: "quit" };
  selected: boolean;
}

function ItemRow({ item, selected }: ItemRowProps) {
  const cursor = selected ? "▸ " : "  ";
  const color = selected ? "cyan" : undefined;
  if (item.kind === "new") {
    return (
      <Text color={color} bold={selected}>
        {cursor}新游戏
      </Text>
    );
  }
  if (item.kind === "quit") {
    return (
      <Text color={color} bold={selected}>
        {cursor}退出
      </Text>
    );
  }
  const s = item.session;
  const progress = formatProgress(s);
  return (
    <Box>
      <Text color={color} bold={selected}>
        {cursor}继续: {s.name}
      </Text>
      <Text dimColor>  {progress}</Text>
    </Box>
  );
}

function formatProgress(s: SessionMeta): string {
  if (s.currentScriptId) {
    return `进行中 · ${s.currentScriptId} · ${s.completedScriptCount} 完成`;
  }
  if (s.lastCompletedId && /^00[5-9]/.test(s.lastCompletedId)) {
    return `✓ ${s.lastCompletedId}`;
  }
  if (s.completedScriptCount > 0) {
    return `${s.completedScriptCount} 完成`;
  }
  return `空`;
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
