import { evaluateCondition } from "./condition";
import { applyDelta, cloneState, createInitialState } from "./state";
import type {
  Action,
  ComposedState,
  EndConditionSpec,
  Game,
  HubActivity,
  HubSnapshot,
  Input,
  Output,
  RenderedChoice,
  Script,
  ScriptInfo,
  StateDelta,
  TrainingConfig,
} from "./types";
import { END_LABEL } from "./types";

export class Engine {
  private state: ComposedState;
  private readonly scriptMap: Map<string, Script>;
  private readonly actionMap: Map<string, Action>;
  private readonly characterNameMap: Map<string, string>;

  constructor(
    private readonly game: Game,
    initialState?: ComposedState,
  ) {
    this.state = initialState ?? createInitialState(game);
    this.scriptMap = new Map(game.scripts.map((s) => [s.id, s]));
    this.actionMap = new Map((game.actions ?? []).map((a) => [a.id, a]));
    this.characterNameMap = new Map(game.characters.map((c) => [c.id, c.name]));
  }

  getState(): ComposedState {
    return cloneState(this.state);
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  getAvailableScripts(): ScriptInfo[] {
    return this.game.scripts
      .filter(
        (s) =>
          !this.state.baseline.completedScripts.includes(s.id) &&
          (s.requires === undefined ||
            evaluateCondition(s.requires, this.state)),
      )
      .map((s) => ({ id: s.id, title: s.title }));
  }

  async *run(): AsyncGenerator<Output, void, Input> {
    while (true) {
      const endCheck = this.checkEndConditions();
      if (endCheck) {
        if (
          endCheck.goto &&
          !this.state.baseline.completedScripts.includes(endCheck.goto)
        ) {
          const endingScript = this.scriptMap.get(endCheck.goto);
          if (endingScript) {
            this.state.baseline.currentScriptId = endCheck.goto;
            this.state.baseline.beatIndex = 0;
            const finished = yield* this.runScript(endingScript);
            if (finished) {
              this.state.baseline.completedScripts.push(endCheck.goto);
              this.state.baseline.currentScriptId = null;
              this.state.baseline.beatIndex = 0;
            } else {
              return;
            }
          }
        }
        yield { type: "gameEnd", reason: endCheck.reason };
        return;
      }

      if (this.state.baseline.currentScriptId !== null) {
        const script = this.scriptMap.get(this.state.baseline.currentScriptId);
        if (!script) {
          throw new Error(
            `Engine: current script not found: ${this.state.baseline.currentScriptId}`,
          );
        }
        const finished = yield* this.runScript(script);
        if (finished) {
          this.state.baseline.completedScripts.push(script.id);
          this.state.baseline.currentScriptId = null;
          this.state.baseline.beatIndex = 0;
          if (this.state.training) {
            this.advanceTime(1);
          }
        } else {
          return;
        }
        continue;
      }

      if (this.state.training && this.game.training) {
        const input = yield this.buildHubMenu();
        if (input.type === "quit") return;
        if (input.type !== "doActivity") continue;
        const dispatched = yield* this.dispatchActivity(input.id);
        if (dispatched === "quit") return;
      } else {
        const available = this.getAvailableScripts();
        if (available.length === 0) {
          yield { type: "gameEnd" };
          return;
        }
        const completedId =
          this.state.baseline.completedScripts[
            this.state.baseline.completedScripts.length - 1
          ] ?? null;
        const input = yield {
          type: "scriptComplete",
          completedId,
          nextAvailable: available,
        };
        if (input.type === "quit") return;
        if (input.type !== "select") continue;
        if (!this.scriptMap.has(input.scriptId)) continue;
        this.state.baseline.currentScriptId = input.scriptId;
        this.state.baseline.beatIndex = 0;
      }
    }
  }

  private checkEndConditions(): EndConditionSpec | null {
    if (!this.game.training) return null;
    for (const ec of this.game.training.endConditions) {
      if (evaluateCondition(ec.when, this.state)) {
        return ec;
      }
    }
    return null;
  }

  private buildHubMenu(): Output {
    const cfg = this.game.training!;
    const t = this.state.training!;
    const slotName = cfg.slotNames[t.slot] ?? `slot ${t.slot}`;
    const isNight = t.slot === cfg.slotsPerDay - 1;

    const activities: HubActivity[] = [];

    for (const s of this.game.scripts) {
      if (this.state.baseline.completedScripts.includes(s.id)) continue;
      const available =
        s.requires === undefined ||
        evaluateCondition(s.requires, this.state);
      if (!available) continue;
      const explicitlyEnding = this.isExplicitlyEndingScript(s.id);
      if (explicitlyEnding) continue;
      activities.push({
        id: `script:${s.id}`,
        kind: "script",
        title: `📖 ${s.title}`,
        cost: 1,
        available: true,
      });
    }

    for (const a of this.game.actions ?? []) {
      if (a.slot === "day" && isNight) continue;
      if (a.slot === "night" && !isNight) continue;
      const available =
        a.requires === undefined ||
        evaluateCondition(a.requires, this.state);
      activities.push({
        id: `action:${a.id}`,
        kind: "action",
        title: a.title,
        description: a.description,
        category: a.category,
        cost: a.cost,
        effectsHint: formatEffectsHint(a.effects),
        available,
        lockedReason: available ? undefined : "条件未满足",
      });
    }

    const snapshot: HubSnapshot = {
      day: t.day,
      maxDay: cfg.maxDay,
      slot: t.slot,
      slotName,
      slotsPerDay: cfg.slotsPerDay,
      stats: cfg.stats.map((sd) => ({
        id: sd.id,
        name: sd.name,
        value: t.stats[sd.id] ?? 0,
        min: sd.min,
        max: t.statMax[sd.id] ?? sd.max,
      })),
      affections: this.game.characters.map((c) => ({
        id: c.id,
        name: c.name,
        value: this.state.baseline.characters[c.id]?.affection ?? 0,
      })),
      activities,
    };

    return { type: "hubMenu", snapshot };
  }

  private isExplicitlyEndingScript(scriptId: string): boolean {
    if (!this.game.training) return false;
    return this.game.training.endConditions.some((ec) => ec.goto === scriptId);
  }

  private async *dispatchActivity(
    activityId: string,
  ): AsyncGenerator<Output, "ok" | "quit", Input> {
    if (activityId.startsWith("script:")) {
      const scriptId = activityId.slice("script:".length);
      if (!this.scriptMap.has(scriptId)) return "ok";
      if (this.state.baseline.completedScripts.includes(scriptId)) return "ok";
      this.state.baseline.currentScriptId = scriptId;
      this.state.baseline.beatIndex = 0;
      return "ok";
    }
    if (activityId.startsWith("action:")) {
      const actionId = activityId.slice("action:".length);
      const action = this.actionMap.get(actionId);
      if (!action) return "ok";
      const available =
        action.requires === undefined ||
        evaluateCondition(action.requires, this.state);
      if (!available) return "ok";
      const result = yield* this.runAction(action);
      return result;
    }
    return "ok";
  }

  private async *runAction(
    action: Action,
  ): AsyncGenerator<Output, "ok" | "quit", Input> {
    if (action.kind === "combat") {
      const combatResult = yield* this.runCombat(action);
      if (combatResult === "quit") return "quit";
    } else {
      if (action.effects) applyDelta(this.state, action.effects);
      if (action.kind === "sleep") {
        const t = this.state.training!;
        for (const statId of Object.keys(t.stats)) {
          if (
            statId === "physical" ||
            statId === "energy" ||
            statId === "stamina"
          ) {
            t.stats[statId] = t.statMax[statId] ?? t.stats[statId]!;
          }
        }
      }
    }
    this.advanceTime(action.cost);
    return "ok";
  }

  private async *runCombat(
    action: Action,
  ): AsyncGenerator<Output, "ok" | "quit", Input> {
    const t = this.state.training!;
    const swordPower = t.stats.sword_power ?? 0;
    const spectral = t.stats.spectral ?? 0;
    const day = t.day;

    const enemyHp = 8 + day * 2;
    const variance = 0.8 + Math.random() * 0.4;
    let damage = swordPower * (1 + spectral * 0.04) * variance;

    const critRoll = Math.random() * 100;
    const fumbleRoll = Math.random() * 100;
    const isCrit = critRoll < spectral * 0.7;
    const isFumble = !isCrit && fumbleRoll < spectral * 0.5;

    const intro = yield {
      type: "narration",
      text: `夜风刺骨。一团扭曲的影子从巷子尽头爬出——HP ${enemyHp} 的妖怪。`,
    };
    if (intro.type === "quit") return "quit";

    if (isCrit) {
      damage *= 2;
      const c = yield {
        type: "narration",
        text: `妖刀震动，你斩出了双倍威力！(造成 ${Math.floor(damage)} 伤害)`,
      };
      if (c.type === "quit") return "quit";
    } else if (isFumble) {
      damage = 0;
      applyDelta(this.state, { stats: { physical: -3 } });
      const f = yield {
        type: "narration",
        text: `妖力反噬。你被自己的刀气擦伤，体力 -3。`,
      };
      if (f.type === "quit") return "quit";
    } else {
      const n = yield {
        type: "narration",
        text: `你拔刀。冷光一闪，造成 ${Math.floor(damage)} 伤害。`,
      };
      if (n.type === "quit") return "quit";
    }

    let spectralDelta: number;
    let victory: boolean;
    const finalDamage = Math.floor(damage);

    if (finalDamage >= enemyHp) {
      victory = true;
      const absorb = Math.floor(enemyHp / 2);
      spectralDelta = -absorb;
      applyDelta(this.state, {
        stats: {
          spectral: -absorb,
          sword_power: Math.max(1, Math.floor(enemyHp / 5)),
          mental: -2,
        },
      });
      const v = yield {
        type: "narration",
        text: `妖怪化为光点散去。你把它的妖力封入刀里——灵体化 -${absorb}, 妖刀威力 +${Math.max(1, Math.floor(enemyHp / 5))}。`,
      };
      if (v.type === "quit") return "quit";
    } else {
      victory = false;
      spectralDelta = 5;
      applyDelta(this.state, {
        stats: { spectral: 5, physical: -5, mental: -3 },
      });
      const d = yield {
        type: "narration",
        text: `妖怪逃了。它的妖力侵蚀了你——灵体化 +5, 体力 -5。`,
      };
      if (d.type === "quit") return "quit";
    }

    t.combatLog.push({
      day,
      enemyHp,
      damage: finalDamage,
      crit: isCrit,
      fumble: isFumble,
      victory,
      spectralDelta,
    });

    if (action.effects) applyDelta(this.state, action.effects);
    return "ok";
  }

  private advanceTime(slots: number): void {
    if (!this.state.training || !this.game.training) return;
    const cfg = this.game.training;
    const t = this.state.training;
    t.slot += slots;
    while (t.slot >= cfg.slotsPerDay) {
      t.slot -= cfg.slotsPerDay;
      t.day += 1;
      if (cfg.decayPerDay !== 0 && cfg.decayStatId) {
        applyDelta(this.state, {
          stats: { [cfg.decayStatId]: cfg.decayPerDay },
        });
      }
    }
  }

  private async *runScript(
    script: Script,
  ): AsyncGenerator<Output, boolean, Input> {
    const labelMap = buildLabelMap(script);
    while (this.state.baseline.beatIndex < script.beats.length) {
      const beat = script.beats[this.state.baseline.beatIndex];
      if (!beat) break;

      switch (beat.type) {
        case "narration": {
          const input = yield { type: "narration", text: beat.text };
          if (input.type === "quit") return false;
          break;
        }
        case "dialogue": {
          const speakerName =
            this.characterNameMap.get(beat.speaker) ?? beat.speaker;
          const input = yield {
            type: "dialogue",
            speakerId: beat.speaker,
            speakerName,
            text: beat.text,
          };
          if (input.type === "quit") return false;
          break;
        }
        case "choice": {
          const rendered: RenderedChoice[] = beat.options.map((opt) => {
            const available =
              opt.requires === undefined ||
              evaluateCondition(opt.requires, this.state);
            return {
              text: opt.text,
              available,
              lockedReason: available ? undefined : "条件未满足",
            };
          });
          const input = yield {
            type: "choice",
            prompt: beat.prompt,
            options: rendered,
          };
          if (input.type === "quit") return false;
          if (input.type !== "choose") continue;
          const chosen = beat.options[input.index];
          if (!chosen) continue;
          if (rendered[input.index]?.available === false) continue;
          if (chosen.effects) applyDelta(this.state, chosen.effects);
          if (chosen.goto !== undefined) {
            if (chosen.goto === END_LABEL) {
              return true;
            }
            const target = labelMap.get(chosen.goto);
            if (target === undefined) {
              throw new Error(
                `Engine: choice goto target not found in script "${script.id}": ${chosen.goto}`,
              );
            }
            this.state.baseline.beatIndex = target;
            continue;
          }
          break;
        }
        case "effects": {
          applyDelta(this.state, beat.effects);
          break;
        }
        case "label": {
          break;
        }
        case "endScript": {
          return true;
        }
        case "clear": {
          const input = yield { type: "clear" };
          if (input.type === "quit") return false;
          break;
        }
      }

      this.state.baseline.beatIndex++;
    }
    return true;
  }
}

function buildLabelMap(script: Script): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < script.beats.length; i++) {
    const beat = script.beats[i];
    if (beat?.type === "label") {
      map.set(beat.name, i);
    }
  }
  return map;
}

function formatEffectsHint(effects: StateDelta | undefined): string | undefined {
  if (!effects) return undefined;
  const parts: string[] = [];
  if (effects.affection) {
    for (const [k, v] of Object.entries(effects.affection)) {
      parts.push(`${k}${v >= 0 ? "+" : ""}${v}`);
    }
  }
  if (effects.stats) {
    for (const [k, v] of Object.entries(effects.stats)) {
      parts.push(`${k}${v >= 0 ? "+" : ""}${v}`);
    }
  }
  if (effects.flags) {
    for (const [k, v] of Object.entries(effects.flags)) {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
