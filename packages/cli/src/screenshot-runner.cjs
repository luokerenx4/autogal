#!/usr/bin/env node
// Standalone Node runner for the `rpgh screenshot` subcommand.
//
// Reason this is its own file (not part of screenshot.ts): node-pty's
// native binding is currently incompatible with Bun's runtime — onExit
// callbacks never fire — so we must spawn it under Node. screenshot.ts
// shells out to this script and pipes its stdout back to the user.
//
// Args via stdin JSON: { gameDir, keys, cols, rows, waitMs, out, cwd }.

const pty = require("node-pty");
const { Terminal } = require("@xterm/headless");
const path = require("path");
const { writeFileSync, chmodSync, existsSync } = require("fs");

function ensurePtyExecutable() {
  // bun install strips +x from prebuilt binaries; restore so posix_spawnp
  // can launch the helper.
  const candidates = [
    "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
    "node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
    "node_modules/.bun/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
    "node_modules/.bun/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try { chmodSync(p, 0o755); } catch (_) {}
    }
  }
}

function encodeKey(token) {
  switch (token) {
    case "Enter": return "\r";
    case "Esc": return "\x1b";
    case "Space": return " ";
    case "Tab": return "\t";
    case "Backspace": return "\x7f";
    case "Up": return "\x1b[A";
    case "Down": return "\x1b[B";
    case "Right": return "\x1b[C";
    case "Left": return "\x1b[D";
    default: return token;
  }
}

function renderBuffer(term, rows) {
  const buf = term.buffer.active;
  const lines = [];
  for (let i = 0; i < rows; i++) {
    const line = buf.getLine(i);
    lines.push(line ? line.translateToString(true) : "");
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  ensurePtyExecutable();
  let raw = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) raw += chunk;
  const args = JSON.parse(raw);
  const { gameDir, keys, cols, rows, waitMs, out, cwd } = args;

  const term = new Terminal({ cols, rows, allowProposedApi: true });
  const child = pty.spawn(
    "bun",
    ["packages/cli/src/bin.ts", "play", path.resolve(gameDir)],
    { cols, rows, cwd, env: process.env },
  );
  child.onData((d) => term.write(d));

  await sleep(waitMs);

  const tokens = keys.length === 0 ? [] : keys.split(",");
  for (const token of tokens) {
    const delayMatch = token.match(/^:(\d+)$/);
    if (delayMatch) {
      await sleep(Number(delayMatch[1]));
      continue;
    }
    child.write(encodeKey(token));
    await sleep(waitMs);
  }

  await sleep(waitMs);
  child.kill();
  // small grace so the kill propagates before we read the buffer
  await sleep(50);

  const text = renderBuffer(term, rows);
  if (out) {
    writeFileSync(out, text + "\n");
  } else {
    process.stdout.write(text);
    if (!text.endsWith("\n")) process.stdout.write("\n");
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`screenshot-runner: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
