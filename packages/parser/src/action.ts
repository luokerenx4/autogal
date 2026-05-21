import { parse as parseYaml } from "yaml";
import type { Action, StateDelta } from "@autogal/engine";
import { parseCondition } from "./condition";

export class ActionParseError extends Error {}

export function parseAction(content: string, source?: string): Action {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new ActionParseError(
      `${source ?? "action"}: invalid YAML — ${(err as Error).message}`,
    );
  }
  if (!raw || typeof raw !== "object") {
    throw new ActionParseError(`${source ?? "action"}: must be a YAML object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.length === 0) {
    throw new ActionParseError(`${source ?? "action"}: missing \`id\``);
  }
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    throw new ActionParseError(`${source ?? "action"}: missing \`title\``);
  }
  const action: Action = {
    id: obj.id,
    title: obj.title,
    cost: typeof obj.cost === "number" ? obj.cost : 1,
  };
  if (typeof obj.description === "string") {
    action.description = obj.description;
  }
  if (typeof obj.category === "string") {
    action.category = obj.category;
  }
  if (obj.slot === "any" || obj.slot === "day" || obj.slot === "night") {
    action.slot = obj.slot;
  }
  if (
    obj.kind === "combat" ||
    obj.kind === "sleep" ||
    obj.kind === "plain" ||
    obj.kind === "useItem"
  ) {
    action.kind = obj.kind;
  }
  if (typeof obj.itemId === "string") {
    action.itemId = obj.itemId;
  }
  if (typeof obj.enemyId === "string") {
    action.enemyId = obj.enemyId;
  }
  if (action.kind === "useItem" && !action.itemId) {
    throw new ActionParseError(
      `${source ?? action.id}: kind=useItem requires an \`itemId\` field`,
    );
  }
  const requires = parseCondition(obj.requires);
  if (requires) action.requires = requires;
  const effects = parseEffectsObject(obj.effects, source);
  if (effects) action.effects = effects;
  return action;
}

function parseEffectsObject(
  raw: unknown,
  source: string | undefined,
): StateDelta | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new ActionParseError(
      `${source ?? "action"}: effects must be an object`,
    );
  }
  const obj = raw as Record<string, unknown>;
  const delta: StateDelta = {};
  if (obj.affection !== undefined) {
    if (typeof obj.affection !== "object" || obj.affection === null) {
      throw new ActionParseError(
        `${source ?? "action"}: effects.affection must be an object`,
      );
    }
    delta.affection = obj.affection as Record<string, number>;
  }
  if (obj.flags !== undefined) {
    if (typeof obj.flags !== "object" || obj.flags === null) {
      throw new ActionParseError(
        `${source ?? "action"}: effects.flags must be an object`,
      );
    }
    delta.flags = obj.flags as Record<string, number | string | boolean>;
  }
  if (obj.stats !== undefined) {
    if (typeof obj.stats !== "object" || obj.stats === null) {
      throw new ActionParseError(
        `${source ?? "action"}: effects.stats must be an object`,
      );
    }
    delta.stats = obj.stats as Record<string, number>;
  }
  if (obj.statMax !== undefined) {
    if (typeof obj.statMax !== "object" || obj.statMax === null) {
      throw new ActionParseError(
        `${source ?? "action"}: effects.statMax must be an object`,
      );
    }
    delta.statMax = obj.statMax as Record<string, number>;
  }
  if (obj.inventory !== undefined) {
    if (typeof obj.inventory !== "object" || obj.inventory === null) {
      throw new ActionParseError(
        `${source ?? "action"}: effects.inventory must be an object`,
      );
    }
    delta.inventory = obj.inventory as Record<string, number>;
  }
  return delta;
}
