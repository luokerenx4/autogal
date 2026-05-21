// spectral-combat: the 妖刀さくら抄 combat formula. Lives with the game
// content because the stat names (sword_power, spectral, mental, physical),
// damage scaling, and crit/fumble rates are all specific to this game's
// design. The engine doesn't know any of this exists; it just sees
// `kind: "combat"` actions dispatch through whatever handler this module
// registers.

import type {
  ActionHandler,
  ActionResult,
  Module,
  StateDelta,
} from "@autogal/engine";

export interface SpectralCombatLogEntry {
  day: number;
  enemyHp: number;
  damage: number;
  crit: boolean;
  fumble: boolean;
  victory: boolean;
  spectralDelta: number;
}

const spectralCombatHandler: ActionHandler = ({ state, action, rng }) => {
  const t = state.training!;
  const swordPower = t.stats.sword_power ?? 0;
  const spectral = t.stats.spectral ?? 0;
  const intellect = t.stats.intellect ?? 0;
  const day = t.day;

  const enemyHp = Math.floor(6 + day * 1.5);

  // Roll once. If we fumble AND intellect >= 5, spend intellect -2
  // and re-roll the whole strike. This gives the player a way to
  // hedge against the spectral × 0.5% fumble chance in late-game when
  // spectral is high — invest in study early, cash in for stability.
  const rollStrike = () => {
    const variance = 0.8 + rng() * 0.4;
    let damage = swordPower * (1 + spectral * 0.04) * variance;
    const critRoll = rng() * 100;
    const fumbleRoll = rng() * 100;
    const isCrit = critRoll < spectral * 0.7;
    const isFumble = !isCrit && fumbleRoll < spectral * 0.5;
    if (isCrit) damage *= 2;
    if (isFumble) damage = 0;
    return { damage, isCrit, isFumble };
  };

  let { damage, isCrit, isFumble } = rollStrike();
  let rerolled = false;
  if (isFumble && intellect >= 5) {
    ({ damage, isCrit, isFumble } = rollStrike());
    rerolled = true;
  }
  const finalDamage = Math.floor(damage);
  const victory = finalDamage >= enemyHp;

  const stats: Record<string, number> = {};
  const add = (k: string, n: number) => {
    stats[k] = (stats[k] ?? 0) + n;
  };

  const narrations: string[] = [
    `夜风刺骨。一团扭曲的影子从巷子尽头爬出——HP ${enemyHp} 的妖怪。`,
  ];

  if (rerolled) {
    add("intellect", -2);
    narrations.push(
      `刚才那一刀差点失手——你冷静下来，调动学识里的术式，重新挥出 (学识 -2)。`,
    );
  }

  if (isCrit) {
    narrations.push(
      `妖刀震动，你斩出了双倍威力！(造成 ${finalDamage} 伤害)`,
    );
  } else if (isFumble) {
    add("physical", -3);
    narrations.push(`妖力反噬。你被自己的刀气擦伤，体力 -3。`);
  } else {
    narrations.push(`你拔刀。冷光一闪，造成 ${finalDamage} 伤害。`);
  }

  let spectralDelta: number;
  if (victory) {
    const absorb = Math.floor(enemyHp / 2);
    const swordGain = Math.max(2, Math.floor(enemyHp / 4));
    spectralDelta = -absorb;
    add("spectral", -absorb);
    add("sword_power", swordGain);
    add("mental", -2);
    narrations.push(
      `妖怪化为光点散去。你把它的妖力封入刀里——灵体化 -${absorb}, 妖刀威力 +${swordGain}。`,
    );
  } else {
    spectralDelta = 5;
    add("spectral", 5);
    add("physical", -5);
    add("mental", -3);
    narrations.push(`妖怪逃了。它的妖力侵蚀了你——灵体化 +5, 体力 -5。`);
  }

  // Merge action.effects into the same delta so the engine applies once.
  const deltas: StateDelta = { stats };
  if (action.effects?.stats) {
    for (const [k, v] of Object.entries(action.effects.stats)) add(k, v);
  }
  if (action.effects?.affection) deltas.affection = action.effects.affection;
  if (action.effects?.flags) deltas.flags = action.effects.flags;

  const logEntry: SpectralCombatLogEntry = {
    day,
    enemyHp,
    damage: finalDamage,
    crit: isCrit,
    fumble: isFumble,
    victory,
    spectralDelta,
  };

  const result: ActionResult = {
    narrations,
    deltas,
    customLog: { moduleId: "spectral-combat", entry: logEntry },
  };
  return result;
};

const combatModule: Module = {
  id: "spectral-combat",
  version: "1.0.0",
  actionHandlers: {
    combat: spectralCombatHandler,
  },
};

export default combatModule;
