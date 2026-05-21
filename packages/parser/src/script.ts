import { parse as parseYaml } from "yaml";
import type {
  Beat,
  ChoiceOption,
  Script,
  StateDelta,
} from "@autogal/engine";
import { splitFrontmatter } from "./frontmatter";
import { parseCondition } from "./condition";
import { parseInlineEffects } from "./inline-effects";

export class ScriptParseError extends Error {
  constructor(message: string, public source?: string) {
    super(message);
  }
}

export function parseScript(content: string, source?: string): Script {
  const { meta, body } = splitFrontmatter(content);
  const id = readString(meta, "id", source);
  const title = readString(meta, "title", source);
  const requires = parseCondition(meta.requires);
  const characters = readStringArray(meta, "characters");

  const beats = parseBody(body, source);
  return {
    id,
    title,
    ...(requires !== undefined ? { requires } : {}),
    ...(characters !== undefined ? { characters } : {}),
    beats,
  };
}

function readString(
  meta: Record<string, unknown>,
  key: string,
  source?: string,
): string {
  const v = meta[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new ScriptParseError(
      `Missing or invalid \`${key}\` in frontmatter`,
      source,
    );
  }
  return v;
}

function readStringArray(
  meta: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const v = meta[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new ScriptParseError(`\`${key}\` must be an array of strings`);
  }
  return v as string[];
}

interface BlockSpan {
  startLine: number;
  endLine: number;
  text: string;
}

function parseBody(body: string, source?: string): Beat[] {
  const lines = body.split(/\r?\n/);
  const beats: Beat[] = [];
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
    if (i >= lines.length) break;

    const fence = matchFenceOpen(lines[i]);
    if (fence !== null) {
      const fenceStart = i + 1;
      let fenceEnd = fenceStart;
      while (fenceEnd < lines.length && !matchFenceClose(lines[fenceEnd])) {
        fenceEnd++;
      }
      const fenceContent = lines.slice(fenceStart, fenceEnd).join("\n");
      beats.push(parseFenceBeat(fenceContent, source));
      i = fenceEnd + 1;
      continue;
    }

    const block = collectBlock(lines, i);
    beats.push(parseTextBlock(block, source));
    i = block.endLine + 1;
  }
  return beats;
}

function collectBlock(lines: string[], start: number): BlockSpan {
  let end = start;
  while (end < lines.length && (lines[end] ?? "").trim() !== "") end++;
  return {
    startLine: start,
    endLine: end - 1,
    text: lines.slice(start, end).join("\n"),
  };
}

function parseTextBlock(block: BlockSpan, source?: string): Beat {
  const first = (block.text.split("\n")[0] ?? "").trim();

  if (first === "[end]") {
    return { type: "endScript" };
  }
  if (first.startsWith("?")) {
    return parseChoiceBlock(block, source);
  }
  if (first.startsWith("@")) {
    return parseDialogueBlock(block, source);
  }
  if (first.startsWith("#") && /^#\s*[a-zA-Z_][\w-]*\s*$/.test(first)) {
    return { type: "label", name: first.replace(/^#\s*/, "").trim() };
  }
  return { type: "narration", text: block.text.trim() };
}

function parseDialogueBlock(block: BlockSpan, source?: string): Beat {
  const lines = block.text.split("\n");
  const first = lines[0] ?? "";
  const match = first.match(/^@(\S+)\s*(.*)$/);
  if (!match || !match[1]) {
    throw new ScriptParseError(`Malformed dialogue line: ${first}`, source);
  }
  const speaker = match[1];
  const firstText = match[2] ?? "";
  const rest = lines.slice(1).join("\n");
  const text = firstText
    ? rest
      ? `${firstText}\n${rest}`
      : firstText
    : rest;
  return { type: "dialogue", speaker, text: text.trim() };
}

function parseChoiceBlock(block: BlockSpan, source?: string): Beat {
  const lines = block.text.split("\n");
  const first = lines[0] ?? "";
  const prompt = first.replace(/^\?\s*/, "").trim();
  const options: ChoiceOption[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (!trimmed.startsWith("-")) {
      throw new ScriptParseError(
        `Choice block has non-option line: "${trimmed}"`,
        source,
      );
    }
    const rest = trimmed.slice(1).trim();
    const arrowIdx = rest.indexOf("->");
    let text = rest;
    let effects: StateDelta | undefined;
    let goto: string | undefined;
    if (arrowIdx >= 0) {
      text = rest.slice(0, arrowIdx).trim();
      const tail = rest.slice(arrowIdx + 2).trim();
      const parsed = parseChoiceTail(tail);
      effects = parsed.effects;
      goto = parsed.goto;
    }
    options.push({
      text,
      ...(effects !== undefined ? { effects } : {}),
      ...(goto !== undefined ? { goto } : {}),
    });
  }
  return {
    type: "choice",
    ...(prompt ? { prompt } : {}),
    options,
  };
}

function parseChoiceTail(tail: string): {
  effects?: StateDelta;
  goto?: string;
} {
  const segments = tail.split("|").map((s) => s.trim()).filter(Boolean);
  let effects: StateDelta | undefined;
  let goto: string | undefined;
  for (const seg of segments) {
    if (seg.startsWith("goto ")) {
      goto = seg.slice(5).trim();
      continue;
    }
    const e = parseInlineEffects(seg);
    if (e) effects = effects ? mergeDeltas(effects, e) : e;
  }
  return {
    ...(effects !== undefined ? { effects } : {}),
    ...(goto !== undefined ? { goto } : {}),
  };
}

function mergeDeltas(a: StateDelta, b: StateDelta): StateDelta {
  return {
    ...(a.affection || b.affection
      ? { affection: { ...(a.affection ?? {}), ...(b.affection ?? {}) } }
      : {}),
    ...(a.flags || b.flags
      ? { flags: { ...(a.flags ?? {}), ...(b.flags ?? {}) } }
      : {}),
  };
}

function parseFenceBeat(content: string, source?: string): Beat {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    throw new ScriptParseError(
      `Invalid YAML in fenced block: ${(err as Error).message}`,
      source,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ScriptParseError("Fenced block must be a YAML object", source);
  }
  const obj = parsed as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string") {
    throw new ScriptParseError(
      "Fenced block must have a `type` field",
      source,
    );
  }
  switch (type) {
    case "choice":
      return parseFenceChoice(obj, source);
    case "effects":
      return parseFenceEffects(obj, source);
    case "clear":
      return { type: "clear" };
    default:
      throw new ScriptParseError(`Unknown fenced beat type: ${type}`, source);
  }
}

function parseFenceChoice(
  obj: Record<string, unknown>,
  source?: string,
): Beat {
  const prompt = typeof obj.prompt === "string" ? obj.prompt : undefined;
  const rawOptions = obj.options;
  if (!Array.isArray(rawOptions)) {
    throw new ScriptParseError(
      "Choice fence must have an `options` array",
      source,
    );
  }
  const options: ChoiceOption[] = rawOptions.map((o, idx) => {
    if (!o || typeof o !== "object") {
      throw new ScriptParseError(
        `Choice option ${idx} must be an object`,
        source,
      );
    }
    const opt = o as Record<string, unknown>;
    if (typeof opt.text !== "string") {
      throw new ScriptParseError(
        `Choice option ${idx} missing \`text\``,
        source,
      );
    }
    const requires = parseCondition(opt.requires);
    const effects = parseEffectsObject(opt.effects, source, idx);
    const goto = typeof opt.goto === "string" ? opt.goto : undefined;
    return {
      text: opt.text,
      ...(requires !== undefined ? { requires } : {}),
      ...(effects !== undefined ? { effects } : {}),
      ...(goto !== undefined ? { goto } : {}),
    };
  });
  return {
    type: "choice",
    ...(prompt ? { prompt } : {}),
    options,
  };
}

function parseFenceEffects(
  obj: Record<string, unknown>,
  source?: string,
): Beat {
  const effects = parseEffectsObject(obj.effects, source);
  if (!effects) {
    throw new ScriptParseError(
      "Effects fence requires an `effects` field",
      source,
    );
  }
  return { type: "effects", effects };
}

function parseEffectsObject(
  raw: unknown,
  source?: string,
  optionIdx?: number,
): StateDelta | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new ScriptParseError(
      `Effects must be an object${
        optionIdx !== undefined ? ` (option ${optionIdx})` : ""
      }`,
      source,
    );
  }
  const obj = raw as Record<string, unknown>;
  const delta: StateDelta = {};
  if (obj.affection !== undefined) {
    if (typeof obj.affection !== "object" || obj.affection === null) {
      throw new ScriptParseError("`affection` must be an object", source);
    }
    delta.affection = obj.affection as Record<string, number>;
  }
  if (obj.flags !== undefined) {
    if (typeof obj.flags !== "object" || obj.flags === null) {
      throw new ScriptParseError("`flags` must be an object", source);
    }
    delta.flags = obj.flags as Record<string, number | string | boolean>;
  }
  if (obj.stats !== undefined) {
    if (typeof obj.stats !== "object" || obj.stats === null) {
      throw new ScriptParseError("`stats` must be an object", source);
    }
    delta.stats = obj.stats as Record<string, number>;
  }
  if (obj.statMax !== undefined) {
    if (typeof obj.statMax !== "object" || obj.statMax === null) {
      throw new ScriptParseError("`statMax` must be an object", source);
    }
    delta.statMax = obj.statMax as Record<string, number>;
  }
  return delta;
}

const FENCE_OPEN = /^```(?:yaml|yml)?\s*$/;
const FENCE_CLOSE = /^```\s*$/;

function matchFenceOpen(line: string | undefined): true | null {
  if (line === undefined) return null;
  return FENCE_OPEN.test(line) ? true : null;
}

function matchFenceClose(line: string | undefined): boolean {
  if (line === undefined) return false;
  return FENCE_CLOSE.test(line);
}
