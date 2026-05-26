import type { ComposedState, Condition } from "./types";

// Result of evaluating a Condition. `reason` is populated only when
// ok=false, with a short structured string describing which atomic
// predicate failed (and, where meaningful, the current value vs the
// threshold). UI/game layers can show it verbatim or re-render in a
// preferred locale — the engine keeps it terse and machine-greppable
// ("affection.kagari ≥ 4 (現在 2)" rather than a full sentence).
export interface ConditionResult {
  ok: boolean;
  reason?: string;
}

export function evaluateCondition(
  cond: Condition,
  state: ComposedState,
): ConditionResult {
  if ("all" in cond) {
    const failed: string[] = [];
    for (const c of cond.all) {
      const r = evaluateCondition(c, state);
      if (!r.ok) failed.push(r.reason ?? "(reason missing)");
    }
    if (failed.length === 0) return { ok: true };
    return { ok: false, reason: failed.join("、") };
  }
  if ("any" in cond) {
    const reasons: string[] = [];
    for (const c of cond.any) {
      const r = evaluateCondition(c, state);
      if (r.ok) return { ok: true };
      reasons.push(r.reason ?? "(reason missing)");
    }
    return { ok: false, reason: `次の何れか：${reasons.join(" / ")}` };
  }
  if ("not" in cond) {
    const r = evaluateCondition(cond.not, state);
    if (!r.ok) return { ok: true };
    return { ok: false, reason: `否定条件が成立：${r.reason ?? ""}`.trimEnd() };
  }
  if ("scriptCompleted" in cond) {
    const ok = state.baseline.scripts[cond.scriptCompleted]?.completed === true;
    return ok
      ? { ok: true }
      : { ok: false, reason: `前提：${cond.scriptCompleted} 未完了` };
  }
  if ("selfSwitch" in cond) {
    const entry = state.baseline.scripts[cond.selfSwitch.scriptId];
    const value = entry?.selfSwitches[cond.selfSwitch.name] ?? false;
    const eq = cond.selfSwitch.eq ?? true;
    if (value === eq) return { ok: true };
    return {
      ok: false,
      reason: `selfSwitch.${cond.selfSwitch.scriptId}.${cond.selfSwitch.name} = ${eq} が要る (現在 ${value})`,
    };
  }
  if ("affection" in cond) {
    const c = state.baseline.characters[cond.affection.character];
    if (!c) {
      return {
        ok: false,
        reason: `character ${cond.affection.character} unknown`,
      };
    }
    const value = c.stats.affection ?? 0;
    return rangeReason(
      value,
      cond.affection,
      `affection.${cond.affection.character}`,
    );
  }
  if ("characterStat" in cond) {
    const c = state.baseline.characters[cond.characterStat.character];
    if (!c) {
      return {
        ok: false,
        reason: `character ${cond.characterStat.character} unknown`,
      };
    }
    const value = c.stats[cond.characterStat.name] ?? 0;
    return rangeReason(
      value,
      cond.characterStat,
      `${cond.characterStat.character}.${cond.characterStat.name}`,
    );
  }
  if ("switch" in cond) {
    const v = state.baseline.switches[cond.switch.name];
    const { eq } = cond.switch;
    const target = eq ?? true;
    if (v === target) return { ok: true };
    if (eq === undefined) {
      return { ok: false, reason: `switch.${cond.switch.name} が要る` };
    }
    return {
      ok: false,
      reason: `switch.${cond.switch.name} = ${eq} が要る (現在 ${v ?? false})`,
    };
  }
  if ("variable" in cond) {
    const v = state.baseline.variables[cond.variable.name];
    const { eq, min, max } = cond.variable;
    if (eq !== undefined) {
      if (v === eq) return { ok: true };
      return {
        ok: false,
        reason: `${cond.variable.name} = ${String(eq)} が要る (現在 ${String(v)})`,
      };
    }
    if (typeof v !== "number") {
      return {
        ok: false,
        reason: `${cond.variable.name} が数値でない (現在 ${String(v)})`,
      };
    }
    return rangeReason(v, { min, max }, cond.variable.name);
  }
  if ("stat" in cond) {
    if (!state.training) {
      return { ok: false, reason: `stat ${cond.stat.name}: training preset 未使用` };
    }
    const v = state.training.stats[cond.stat.name];
    if (v === undefined) {
      return { ok: false, reason: `stat ${cond.stat.name} 未定義` };
    }
    return rangeReason(v, cond.stat, `stat.${cond.stat.name}`);
  }
  if ("inventory" in cond) {
    const count = state.baseline.inventory[cond.inventory.itemId] ?? 0;
    return rangeReason(
      count,
      cond.inventory,
      `inventory.${cond.inventory.itemId}`,
    );
  }
  if ("weaponPower" in cond) {
    const w = state.baseline.weapons[cond.weaponPower.weaponId];
    if (!w) {
      return {
        ok: false,
        reason: `weapon ${cond.weaponPower.weaponId} 未所持`,
      };
    }
    return rangeReason(
      w.power,
      cond.weaponPower,
      `weapon.${cond.weaponPower.weaponId}.power`,
    );
  }
  if ("knowsSkill" in cond) {
    if (state.baseline.knownSkills.includes(cond.knowsSkill)) {
      return { ok: true };
    }
    return { ok: false, reason: `スキル ${cond.knowsSkill} を覚えていない` };
  }
  if ("day" in cond) {
    if (!state.training) {
      return { ok: false, reason: `day: training preset 未使用` };
    }
    return rangeReason(state.training.day, cond.day, "day");
  }
  if ("slot" in cond) {
    if (!state.training) {
      return { ok: false, reason: `slot: training preset 未使用` };
    }
    return rangeReason(state.training.slot, cond.slot, "slot");
  }
  return { ok: false, reason: "unknown condition" };
}

interface RangeQuery {
  min?: number;
  max?: number;
  eq?: number;
}

function rangeReason(
  value: number,
  q: RangeQuery,
  label: string,
): ConditionResult {
  if (q.eq !== undefined && value !== q.eq) {
    return { ok: false, reason: `${label} = ${q.eq} が要る (現在 ${value})` };
  }
  if (q.min !== undefined && value < q.min) {
    return { ok: false, reason: `${label} ≥ ${q.min} が要る (現在 ${value})` };
  }
  if (q.max !== undefined && value > q.max) {
    return { ok: false, reason: `${label} ≤ ${q.max} が要る (現在 ${value})` };
  }
  return { ok: true };
}
