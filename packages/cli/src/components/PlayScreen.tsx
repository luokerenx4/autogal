import React, { useCallback, useEffect, useReducer, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { watch } from "node:fs";
import { Engine } from "@autogal/engine";
import type { ComposedState, Game, Input, Output } from "@autogal/engine";
import { loadGame } from "../loader";
import { appendLog, loadSession, saveSession } from "../session";
import {
  applyOutput,
  initialModel,
  makeErrorModel,
  type ScreenModel,
} from "../screen-model";
import { dispatchStageInput, footerHintFor } from "../stage-input";
import { BacklogOverlay } from "./BacklogOverlay";
import { GameLayout } from "./GameLayout";
import { StatusBar } from "./StatusBar";
import { NarrationStage } from "./stages/NarrationStage";
import { DialogueStage } from "./stages/DialogueStage";
import { ChoiceStage } from "./stages/ChoiceStage";
import { HubMenuStage } from "./stages/HubMenuStage";
import { ScriptCompleteStage } from "./stages/ScriptCompleteStage";
import { EndedStage } from "./stages/EndedStage";
import { ErrorStage } from "./stages/ErrorStage";
import { LoadingStage } from "./stages/LoadingStage";

const RELOAD_DEBOUNCE_MS = 200;
const RELOAD_INDICATOR_MS = 1500;

interface Props {
  game: Game;
  gameDir: string;
  sessionName: string;
  onOpenMenu: () => void;
}

// PlayScreen owns the engine runner and projects its `Output` stream
// into a stable ScreenModel (see screen-model.ts). The model holds
// exactly one current stage; transient narration/dialogue beats
// accumulate in a backlog instead of stacking up on screen.
//
// Reducer pattern: model is reduced over Outputs as they arrive. Stage
// rendering and key dispatch are both pure functions of the current
// stage — no array of past beats to scroll through.
type ModelAction =
  | { kind: "reset"; model: ScreenModel }
  | { kind: "apply"; output: Output };

function modelReducer(model: ScreenModel, action: ModelAction): ScreenModel {
  if (action.kind === "reset") return action.model;
  return applyOutput(model, action.output);
}

export function PlayScreen({
  game: initialGame,
  gameDir,
  sessionName,
  onOpenMenu,
}: Props) {
  const [model, dispatch] = useReducer(modelReducer, initialModel);
  const stateRef = useRef<ComposedState | null>(null);
  const gameRef = useRef<Game>(initialGame);
  const engineRef = useRef<Engine | null>(null);
  const runnerRef = useRef<AsyncGenerator<Output, void, Input> | null>(null);
  const processingRef = useRef(false);
  const reloadFlashRef = useRef(0);
  const [reloadFlash, setReloadFlash] = React.useState(0);
  const [reloadError, setReloadError] = React.useState<string | null>(null);
  const [showBacklog, setShowBacklog] = React.useState(false);

  // Boot: load saved session (or create initial), build engine, pull the
  // first Output. Errors here become an ErrorStage instead of vanishing
  // into an unhandled promise rejection — that was the silent
  // "loading…" stuck-forever bug.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initialState = await loadSession(gameDir, sessionName, initialGame);
        const engine = new Engine(initialGame, initialState);
        const runner = engine.run();
        gameRef.current = initialGame;
        engineRef.current = engine;
        runnerRef.current = runner;
        const { value, done: isDone } = await runner.next();
        if (cancelled) return;
        if (isDone) {
          dispatch({ kind: "apply", output: { type: "gameEnd" } });
        } else {
          dispatch({ kind: "apply", output: value });
          stateRef.current = engine.getState();
          await saveSession(gameDir, sessionName, engine.getState());
        }
      } catch (err) {
        if (cancelled) return;
        dispatch({ kind: "reset", model: makeErrorModel(err as Error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialGame, gameDir, sessionName]);

  const reload = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const currentState = engine.getState();
      let newGame: Game;
      try {
        newGame = await loadGame(gameDir);
      } catch (err) {
        setReloadError((err as Error).message);
        setTimeout(() => setReloadError(null), 3000);
        return;
      }
      const newEngine = new Engine(newGame, currentState);
      const newRunner = newEngine.run();
      gameRef.current = newGame;
      engineRef.current = newEngine;
      runnerRef.current = newRunner;
      try {
        const { value, done: isDone } = await newRunner.next();
        if (isDone) {
          dispatch({ kind: "apply", output: { type: "gameEnd" } });
        } else {
          dispatch({ kind: "apply", output: value });
          stateRef.current = newEngine.getState();
        }
        reloadFlashRef.current = Date.now();
        setReloadFlash(reloadFlashRef.current);
        setReloadError(null);
      } catch (err) {
        setReloadError(`engine: ${(err as Error).message}`);
        setTimeout(() => setReloadError(null), 3000);
      }
    } finally {
      processingRef.current = false;
    }
  }, [gameDir]);

  // File watcher: rebuild engine on .md/.yaml changes so authors can
  // hot-edit. Filters out the .autogal session directory (else our own
  // saveSession would trigger an immediate reload loop).
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const watcher = watch(gameDir, { recursive: true }, (_evt, filename) => {
      if (!filename) return;
      if (filename.startsWith(".autogal")) return;
      if (filename.startsWith("node_modules")) return;
      if (!/\.(md|yaml|yml)$/i.test(filename)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void reload();
      }, RELOAD_DEBOUNCE_MS);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
    };
  }, [gameDir, reload]);

  useEffect(() => {
    if (reloadFlash === 0) return;
    const timer = setTimeout(() => setReloadFlash(0), RELOAD_INDICATOR_MS);
    return () => clearTimeout(timer);
  }, [reloadFlash]);

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
        stateRef.current = finalState;
        await saveSession(gameDir, sessionName, finalState);
        await appendLog(gameDir, sessionName, {
          t: Date.now(),
          input,
          output: isDone ? null : value,
        });
        if (isDone) {
          dispatch({ kind: "apply", output: { type: "gameEnd" } });
        } else {
          dispatch({ kind: "apply", output: value });
        }
      } catch (err) {
        dispatch({ kind: "reset", model: makeErrorModel(err as Error) });
      } finally {
        processingRef.current = false;
      }
    },
    [gameDir, sessionName],
  );

  // When the backlog overlay is open it owns input via its own useInput;
  // we mount its hook then and skip our own dispatch via `isActive: false`.
  useInput(
    (input, key) => {
      if (key.escape) {
        onOpenMenu();
        return;
      }
      if (input === "b" && hasBacklog(model)) {
        setShowBacklog(true);
        return;
      }
      const engineInput = dispatchStageInput(model.stage, input, key);
      if (engineInput) void sendInput(engineInput);
    },
    { isActive: !showBacklog },
  );

  const game = gameRef.current;
  const state = stateRef.current;

  const header =
    state && model.stage.kind !== "loading" && model.stage.kind !== "error" ? (
      <Box flexDirection="column">
        <StatusBar game={game} state={state} sessionName={sessionName} />
        {reloadError ? (
          <Box paddingX={1}>
            <Text color="red">⚠ 重载失败: {reloadError}</Text>
          </Box>
        ) : reloadFlash > 0 ? (
          <Box paddingX={1}>
            <Text color="green">↻ 已重载</Text>
          </Box>
        ) : null}
      </Box>
    ) : null;

  const footer = (
    <Box paddingX={1}>
      <Text dimColor>
        {[
          footerHintFor(model.stage),
          hasBacklog(model) ? "b 回看" : "",
          "Esc 主菜单",
          "改 .md 自动重载",
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </Box>
  );

  if (showBacklog) {
    return (
      <BacklogOverlay
        entries={model.backlog}
        onClose={() => setShowBacklog(false)}
      />
    );
  }

  return (
    <GameLayout header={header} footer={footer}>
      {renderStage(model)}
    </GameLayout>
  );
}

// "b" is meaningful only when there's something to look at, so the
// hotkey + footer hint both gate on this.
function hasBacklog(model: ScreenModel): boolean {
  return model.backlog.length > 0;
}

function renderStage(model: ScreenModel): React.ReactNode {
  const s = model.stage;
  switch (s.kind) {
    case "loading":
      return <LoadingStage />;
    case "error":
      return <ErrorStage message={s.message} {...(s.stack ? { stack: s.stack } : {})} />;
    case "narration":
      return <NarrationStage text={s.text} />;
    case "dialogue":
      return <DialogueStage speakerName={s.speakerName} text={s.text} />;
    case "choice":
      return <ChoiceStage {...(s.prompt !== undefined ? { prompt: s.prompt } : {})} options={s.options} />;
    case "hubMenu":
      return <HubMenuStage snapshot={s.snapshot} />;
    case "scriptComplete":
      return (
        <ScriptCompleteStage
          completedId={s.completedId}
          nextAvailable={s.nextAvailable}
        />
      );
    case "ended":
      return <EndedStage {...(s.reason !== undefined ? { reason: s.reason } : {})} />;
  }
}
