import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverGames } from "./games";

// Spin up a throwaway games root with three folders:
//   - real-a       (no hidden flag → visible)
//   - real-b       (hidden: false  → visible)
//   - fixture      (hidden: true   → filtered by default)
async function makeFixtureRoot(): Promise<string> {
  const root = await mkdir(
    path.join(tmpdir(), `rpgh-games-test-${Date.now()}-${Math.random()}`),
    { recursive: true },
  ).then(() => path.join(tmpdir(), `rpgh-games-test-${Date.now()}`));
  // Re-mkdir to ensure root exists (path was reused above)
  await mkdir(root, { recursive: true });
  for (const [name, manifest] of [
    ["real-a", "title: Real A\n"],
    ["real-b", "title: Real B\nhidden: false\n"],
    ["fixture", "title: Fixture\nhidden: true\n"],
  ] as const) {
    await mkdir(path.join(root, name), { recursive: true });
    await writeFile(path.join(root, name, "game.yaml"), manifest, "utf-8");
  }
  return root;
}

describe("discoverGames — hidden filter", () => {
  test("hidden games filtered out by default", async () => {
    const root = await makeFixtureRoot();
    try {
      const found = await discoverGames([root]);
      const titles = found.map((g) => g.title).sort();
      expect(titles).toEqual(["Real A", "Real B"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("includeHidden returns everything", async () => {
    const root = await makeFixtureRoot();
    try {
      const found = await discoverGames([root], { includeHidden: true });
      const titles = found.map((g) => g.title).sort();
      expect(titles).toEqual(["Fixture", "Real A", "Real B"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("hidden flag surfaces on the GameCandidate even when filtered in", async () => {
    const root = await makeFixtureRoot();
    try {
      const found = await discoverGames([root], { includeHidden: true });
      const fixture = found.find((g) => g.title === "Fixture");
      const realA = found.find((g) => g.title === "Real A");
      expect(fixture?.hidden).toBe(true);
      expect(realA?.hidden).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
