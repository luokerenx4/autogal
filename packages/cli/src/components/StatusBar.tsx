import React from "react";
import { Box, Text } from "ink";
import type { ComposedState, Game } from "@rpg-harness/engine";

interface StatusBarProps {
  game: Game;
  state: ComposedState;
  sessionName?: string;
}

export function StatusBar({ game, state, sessionName }: StatusBarProps) {
  const characterChips = game.characters.map((c) => {
    const cs = state.baseline.characters[c.id];
    const affection = cs?.stats.affection ?? 0;
    return (
      <Text key={c.id}>
        <Text color="cyan">{c.name}</Text>
        <Text dimColor>:</Text>
        <Text color={affection >= 0 ? "green" : "red"}>{affection}</Text>
      </Text>
    );
  });

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexDirection="row"
      gap={2}
    >
      <Text bold>{game.title}</Text>
      <Text dimColor>│</Text>
      {characterChips.map((chip, i) => (
        <React.Fragment key={i}>
          {chip}
          {i < characterChips.length - 1 ? <Text dimColor> </Text> : null}
        </React.Fragment>
      ))}
      {sessionName ? (
        <>
          <Text dimColor>│</Text>
          <Text dimColor>{sessionName}</Text>
        </>
      ) : null}
    </Box>
  );
}
