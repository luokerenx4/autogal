import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createInitialState, runLoop } from "@rpg-harness/engine";
import type { Game } from "@rpg-harness/engine";
import { type Assertion, type Fixture, mergeState, parseFixture } from "./fixture";
import { type AssertionFailure, runAssertions } from "./assertions";

export interface FixtureResult {
  file: string;
  fixture: Fixture;
  failures: AssertionFailure[];
  durationMs: number;
  error?: string;
}

export async function loadFixtures(testsDir: string): Promise<Array<{ file: string; fixture: Fixture }>> {
  let entries: string[];
  try {
    entries = await readdir(testsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const yamlFiles = entries
    .filter((e) => e.endsWith(".yaml") || e.endsWith(".yml"))
    .sort();
  const fixtures: Array<{ file: string; fixture: Fixture }> = [];
  for (const file of yamlFiles) {
    const fullPath = path.join(testsDir, file);
    const content = await readFile(fullPath, "utf-8");
    const fixture = parseFixture(content, fullPath);
    fixtures.push({ file: fullPath, fixture });
  }
  return fixtures;
}

export async function runFixture(
  game: Game,
  fixture: Fixture,
  file: string,
): Promise<FixtureResult> {
  const started = Date.now();
  try {
    const baseState = createInitialState(game);
    const initialState = mergeState(baseState, fixture.state);
    const loopResult = await runLoop(game, initialState, fixture.inputs, {
      maxSteps: fixture.maxSteps,
    });
    const failures = runAssertions(loopResult, fixture.assertions);
    return {
      file,
      fixture,
      failures,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      file,
      fixture,
      failures: [],
      durationMs: Date.now() - started,
      error: (err as Error).message,
    };
  }
}

export interface RunReport {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  results: FixtureResult[];
}

export function summarize(results: FixtureResult[]): RunReport {
  let passed = 0;
  let failed = 0;
  let errored = 0;
  for (const r of results) {
    if (r.error) errored++;
    else if (r.failures.length === 0) passed++;
    else failed++;
  }
  return {
    total: results.length,
    passed,
    failed,
    errored,
    results,
  };
}

export function formatReport(report: RunReport): string {
  const lines: string[] = [];
  for (const r of report.results) {
    if (r.error) {
      lines.push(`✗ ${relativeName(r.file)}  (${r.durationMs}ms) ERROR`);
      lines.push(`    ${r.error}`);
    } else if (r.failures.length === 0) {
      lines.push(`✓ ${relativeName(r.file)}  (${r.durationMs}ms)`);
    } else {
      lines.push(`✗ ${relativeName(r.file)}  (${r.durationMs}ms)`);
      for (const f of r.failures) {
        lines.push(`    [${f.index}] ${f.assertion.kind}: ${f.message}`);
      }
    }
  }
  lines.push("");
  lines.push(
    `${report.passed}/${report.total} passed${
      report.failed > 0 ? `, ${report.failed} failed` : ""
    }${report.errored > 0 ? `, ${report.errored} errored` : ""}`,
  );
  return lines.join("\n");
}

function relativeName(file: string): string {
  return path.basename(file);
}
