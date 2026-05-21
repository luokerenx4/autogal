import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInitialState } from "@autogal/engine";
import type { ComposedState, Game } from "@autogal/engine";

const SESSION_FILE = "state.json";
const LOG_FILE = "log.jsonl";

export function sessionDir(gameDir: string, name: string): string {
  return path.join(gameDir, ".autogal", "sessions", name);
}

export async function loadSession(
  gameDir: string,
  name: string,
  game: Game,
): Promise<ComposedState> {
  const file = path.join(sessionDir(gameDir, name), SESSION_FILE);
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as ComposedState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return createInitialState(game);
    }
    throw err;
  }
}

export async function saveSession(
  gameDir: string,
  name: string,
  state: ComposedState,
): Promise<void> {
  const dir = sessionDir(gameDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, SESSION_FILE),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

export async function appendLog(
  gameDir: string,
  name: string,
  entry: unknown,
): Promise<void> {
  const dir = sessionDir(gameDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, LOG_FILE),
    JSON.stringify(entry) + "\n",
    { flag: "a" },
  );
}

export async function listSessions(gameDir: string): Promise<string[]> {
  const root = path.join(gameDir, ".autogal", "sessions");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export interface SessionMeta {
  name: string;
  currentScriptId: string | null;
  completedScriptCount: number;
  lastCompletedId: string | null;
  modifiedAt: number;
}

export async function listSessionsWithMeta(
  gameDir: string,
): Promise<SessionMeta[]> {
  const names = await listSessions(gameDir);
  const metas: SessionMeta[] = [];
  for (const name of names) {
    const file = path.join(sessionDir(gameDir, name), SESSION_FILE);
    try {
      const raw = await readFile(file, "utf-8");
      const state = JSON.parse(raw) as ComposedState;
      const baseline = state.baseline ?? {
        currentScriptId: null,
        completedScripts: [],
      };
      const completedScripts = (baseline.completedScripts ?? []) as string[];
      const stat = await import("node:fs/promises").then((m) => m.stat(file));
      metas.push({
        name,
        currentScriptId: (baseline.currentScriptId ?? null) as string | null,
        completedScriptCount: completedScripts.length,
        lastCompletedId: completedScripts[completedScripts.length - 1] ?? null,
        modifiedAt: stat.mtimeMs,
      });
    } catch {
      metas.push({
        name,
        currentScriptId: null,
        completedScriptCount: 0,
        lastCompletedId: null,
        modifiedAt: 0,
      });
    }
  }
  metas.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return metas;
}
