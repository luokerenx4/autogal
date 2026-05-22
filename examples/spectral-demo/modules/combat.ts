// spectral-combat: the 妖刀さくら抄 combat formula. After C7 the enemy
// is data-driven — we look up the enemy from game.enemies using
// action.enemyId, read its base HP + narration templates, and apply
// spectral-demo's day-multiplier scaling on top.
//
// What stays here (game-specific, lives in this module):
//   - the damage formula (sw × (1 + spec × 0.04) × variance)
//   - crit / fumble rates tied to spectral
//   - fumble reroll using intellect
//   - HP day-scaling rule (enemy.hp + day * 1.5)
//   - crit / fumble / hit narrations (about the SWORD, not the enemy)
//
// What's data now:
//   - intro / victory / escape narrations (from enemy.narrations)
//   - enemy base HP + name
//
// Engine doesn't dispatch on enemyId — combat handlers read it themselves.

import type {
  ActionHandler,
  ActionResult,
  EnemyDef,
  Module,
  StateDelta,
} from "@autogal/engine";

export interface SpectralCombatLogEntry {
  day: number;
  enemyId: string;
  enemyHp: number;
  damage: number;
  crit: boolean;
  fumble: boolean;
  victory: boolean;
  spectralDelta: number;
}

// Template substitution. {hp} {name} for intro; {absorb} {swordGain}
// {damage} for outcome lines — author chooses which to use in
// enemies/<id>.md narrations.
function fillTemplate(
  tmpl: string,
  enemy: EnemyDef,
  vars: Record<string, number | string>,
): string {
  let out = tmpl.replaceAll("{name}", enemy.name);
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

const spectralCombatHandler: ActionHandler = ({ state, action, game, rng }) => {
  const t = state.training!;
  // C8: sword_power now lives on the equipped weapon (engine schema),
  // not on training.stats. Read via baseline state directly since
  // ActionContext doesn't carry the full PresetContext.
  const equippedId = state.baseline.equippedWeaponId;
  const swordPower = equippedId
    ? (state.baseline.weapons[equippedId]?.power ?? 0)
    : 0;
  const spectral = t.stats.spectral ?? 0;
  const intellect = t.stats.intellect ?? 0;
  const day = t.day;

  // Resolve enemy from game.enemies via action.enemyId. Falls back to
  // the first declared enemy if action didn't specify one (preserves
  // backward compat for action files that pre-date C7).
  const enemyId = action.enemyId ?? game.enemies?.[0]?.id;
  const enemy = enemyId
    ? game.enemies?.find((e) => e.id === enemyId)
    : undefined;
  if (!enemy) {
    // No enemy data available — return a no-op rather than crashing.
    // Authors will see "nothing happened" and fix their action/enemy
    // declaration.
    return {};
  }

  // Spectral-demo's day scaling rule: base HP + 1.5 per day.
  const enemyHp = Math.floor(enemy.hp + day * 1.5);

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

  const narrations: string[] = [];
  if (enemy.narrations?.intro) {
    narrations.push(
      fillTemplate(enemy.narrations.intro, enemy, { hp: enemyHp }),
    );
  }

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
  // weapon delta goes on a separate field, not stats (sword_power
  // moved to weapon resource in C8).
  const weaponDelta: Record<string, { power?: number }> = {};
  if (victory) {
    const absorb = Math.floor(enemyHp / 2);
    const swordGain = Math.max(2, Math.floor(enemyHp / 4));
    spectralDelta = -absorb;
    add("spectral", -absorb);
    add("mental", -2);
    if (equippedId) weaponDelta[equippedId] = { power: swordGain };
    const tmpl =
      enemy.narrations?.victory ??
      "{name} 化为光点散去——灵体化 -{absorb}, 妖刀威力 +{swordGain}。";
    narrations.push(
      fillTemplate(tmpl, enemy, { hp: enemyHp, absorb, swordGain }),
    );
  } else {
    spectralDelta = 5;
    add("spectral", 5);
    add("physical", -5);
    add("mental", -3);
    const tmpl =
      enemy.narrations?.escape ??
      "{name} 逃了。灵体化 +5, 体力 -5。";
    narrations.push(fillTemplate(tmpl, enemy, { hp: enemyHp }));
  }

  const deltas: StateDelta = { stats };
  if (action.effects?.stats) {
    for (const [k, v] of Object.entries(action.effects.stats)) add(k, v);
  }
  if (action.effects?.affection) deltas.affection = action.effects.affection;
  if (action.effects?.flags) deltas.flags = action.effects.flags;
  if (Object.keys(weaponDelta).length > 0) deltas.weapons = weaponDelta;

  const logEntry: SpectralCombatLogEntry = {
    day,
    enemyId: enemy.id,
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
  version: "1.2.0",
  provides: ["combat"],
  actionHandlers: {
    combat: spectralCombatHandler,
  },
  triggers: [
    // Once the yaodao crosses power 10 (via night_study + combat wins),
    // the player has internalized enough of the sword's structure to
    // perform 净化术式 — granted as a learnable skill. once: true.
    // Silent learn — observable via knownSkills. Authors who want a
    // narrative reveal can pair this with a script that requires
    // knowsSkill and shows the "you've learned X" beat.
    {
      id: "learn_purify",
      when: { weaponPower: { weaponId: "yaodao", min: 10 } },
      once: true,
      do: () => ({
        deltas: { skills: { learn: ["purify"] } },
      }),
    },
  ],
};

export default combatModule;
