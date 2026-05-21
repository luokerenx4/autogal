import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Engine } from "@autogal/engine";
import type { ComposedState, Game, Input, Output } from "@autogal/engine";
import { appendLog, loadSession, saveSession } from "../session";
import { Choices } from "./Choices";
import { ScriptPicker } from "./ScriptPicker";
import { StatusBar } from "./StatusBar";
import { Hint } from "./Hint";

const SCROLLBACK_LIMIT = 12;

interface Props {
  game: Game;
  gameDir: string;
  sessionName: string;
  onOpenMenu: () => void;
}

export function PlayScreen({ game, gameDir, sessionName, onOpenMenu }: Props) {
  const [timeline, setTimeline] = useState<Output[]>([]);
  const [state, setState] = useState<ComposedState | null>(null);
  const [done, setDone] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  const runnerRef = useRef<AsyncGenerator<Output, void, Input> | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initialState = await loadSession(gameDir, sessionName, game);
      const engine = new Engine(game, initialState);
      const runner = engine.run();
      engineRef.current = engine;
      runnerRef.current = runner;
      const { value, done: isDone } = await runner.next();
      if (cancelled) return;
      if (isDone) {
        setDone(true);
      } else {
        setTimeline([value]);
        setState(engine.getState());
        await saveSession(gameDir, sessionName, engine.getState());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game, gameDir, sessionName]);

  const sendInput = useCallback(
    async (input: Input) => {
      if (processingRef.current) return;
      const runner = runnerRef.current;
      const engine = engineRef.current;
      if (!runner || !engine) return;
      processingRef.current = true;
      try {
        const { value, done: isDone } = await runner.next(input);
        const finalState = engine.getState();
        await saveSession(gameDir, sessionName, finalState);
        await appendLog(gameDir, sessionName, {
          t: Date.now(),
          input,
          output: isDone ? null : value,
        });
        if (isDone) {
          setDone(true);
        } else {
          setTimeline((prev) => {
            if (value.type === "clear") return [value];
            return [...prev, value].slice(-SCROLLBACK_LIMIT);
          });
          setState(finalState);
        }
      } finally {
        processingRef.current = false;
      }
    },
    [gameDir, sessionName],
  );

  const current = timeline[timeline.length - 1] ?? null;

  useInput((input, key) => {
    if (key.escape) {
      onOpenMenu();
      return;
    }
    if (!current) return;

    switch (current.type) {
      case "narration":
      case "dialogue":
      case "clear":
        if (key.return || input === " ") void sendInput({ type: "next" });
        break;
      case "choice": {
        const n = Number(input);
        if (Number.isInteger(n) && n >= 1 && n <= current.options.length) {
          const idx = n - 1;
          const opt = current.options[idx];
          if (opt && opt.available) {
            void sendInput({ type: "choose", index: idx });
          }
        }
        break;
      }
      case "scriptComplete": {
        const m = Number(input);
        if (
          Number.isInteger(m) &&
          m >= 1 &&
          m <= current.nextAvailable.length
        ) {
          const choice = current.nextAvailable[m - 1];
          if (choice) {
            void sendInput({ type: "select", scriptId: choice.id });
          }
        }
        break;
      }
    }
  });

  if (done) {
    return (
      <Box flexDirection="column" paddingY={1} paddingX={2}>
        <Text color="gray">— 完 —</Text>
        <Text color="gray">感谢游玩。按 Esc 回主菜单。</Text>
      </Box>
    );
  }

  if (!current || !state) {
    return <Text color="gray">loading…</Text>;
  }

  const scrollback = timeline.slice(0, -1);

  return (
    <Box flexDirection="column">
      <StatusBar game={game} state={state} sessionName={sessionName} />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        {scrollback.map((o, i) => (
          <ScrollbackBeat key={i} output={o} />
        ))}
        <CurrentBeat output={current} />
      </Box>
      <Hint output={current} suffix="Esc 主菜单" />
    </Box>
  );
}

function ScrollbackBeat({ output }: { output: Output }) {
  switch (output.type) {
    case "narration":
      return (
        <Box marginBottom={1}>
          <Text dimColor>{output.text}</Text>
        </Box>
      );
    case "dialogue":
      return (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor color="cyan">
            {output.speakerName}
          </Text>
          <Text dimColor>「{output.text}」</Text>
        </Box>
      );
    case "clear":
      return (
        <Box marginBottom={1}>
          <Text dimColor>─── 场景切换 ───</Text>
        </Box>
      );
    default:
      return null;
  }
}

function CurrentBeat({ output }: { output: Output }) {
  switch (output.type) {
    case "narration":
      return (
        <Box marginTop={1}>
          <Text>{output.text}</Text>
        </Box>
      );
    case "dialogue":
      return (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">
            {output.speakerName}
          </Text>
          <Text>「{output.text}」</Text>
        </Box>
      );
    case "choice":
      return (
        <Box marginTop={1}>
          <Choices prompt={output.prompt} options={output.options} />
        </Box>
      );
    case "scriptComplete":
      return (
        <Box marginTop={1}>
          <ScriptPicker
            completedId={output.completedId}
            options={output.nextAvailable}
          />
        </Box>
      );
    case "clear":
      return <Text color="gray">─── 场景切换 ───</Text>;
    case "gameEnd":
      return <Text color="gray">─── 完 ───</Text>;
  }
}
