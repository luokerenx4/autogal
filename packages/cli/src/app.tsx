import React, { useState } from "react";
import { useApp } from "ink";
import type { Game } from "@rpg-harness/engine";
import { HubScreen } from "./components/HubScreen";
import { PlayScreen } from "./components/PlayScreen";
import { InGameMenu } from "./components/InGameMenu";

type Mode =
  | { kind: "hub" }
  | { kind: "playing"; sessionName: string }
  | { kind: "menu"; sessionName: string };

interface AppProps {
  game: Game;
  gameDir: string;
}

export function App({ game, gameDir }: AppProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>({ kind: "hub" });

  if (mode.kind === "hub") {
    return (
      <HubScreen
        game={game}
        gameDir={gameDir}
        onAction={(action) => {
          if (action.type === "quit") {
            exit();
          } else if (action.type === "play") {
            setMode({ kind: "playing", sessionName: action.sessionName });
          }
        }}
      />
    );
  }

  if (mode.kind === "playing") {
    return (
      <PlayScreen
        game={game}
        gameDir={gameDir}
        sessionName={mode.sessionName}
        onOpenMenu={() =>
          setMode({ kind: "menu", sessionName: mode.sessionName })
        }
      />
    );
  }

  return (
    <InGameMenu
      sessionName={mode.sessionName}
      onAction={(action) => {
        if (action === "continue") {
          setMode({ kind: "playing", sessionName: mode.sessionName });
        } else if (action === "hub") {
          setMode({ kind: "hub" });
        } else if (action === "quit") {
          exit();
        }
      }}
    />
  );
}
