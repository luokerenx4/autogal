// moon-dive: 月读潜行 module — EXE 风的 jack-in 子玩法骨架。
//
// 责任:
//   - 一个 actionHandler (kind: dive) 处理所有 5 个 dive_* action,
//     按 action.id 分派到对应节点的掉落表。每次潜行 RNG 决定本次见闻。
//   - 私有状态 state["moon-dive"]: 每个节点的访问次数 + 是否已撞见 X / 八千代。
//   - 两个 once-only 触发器: 首次撞见 X、八千代试探场景。
//     都通过直接写 ctx.state.baseline.currentScriptId 来"插播"剧本——
//     训练 preset 的 run loop 下一轮会优先跑掉 current script，然后再回 hub。
//
// 为什么不放在 yaml 里:
//   actions/*.yaml 的 effects 是确定的；潜行的核心趣味是 RNG。
//   而且 parser 会丢掉非标字段 (nodeId 之类)，所以分派必须靠 action.id。

import type {
  ActionContext,
  ActionHandler,
  ActionResult,
  Module,
  PresetContext,
  StateDelta,
  Trigger,
} from "@autogal/engine";

const MODULE_ID = "moon-dive";

type NodeId = "konbini" | "hospital" | "idol" | "home" | "core" | "blackonyx";

interface DiveState {
  visits: Record<NodeId, number>;
  metX: boolean;
  yachiyoTested: boolean;
  // Scripts queued by triggers that couldn't claim currentScriptId at fire
  // time. Drained FIFO in onScriptComplete / onActionComplete. Without
  // this, a trigger that fires while another script is running gets its
  // payload silently dropped (once: true means it won't re-fire).
  pendingScripts: string[];
}

function initial(): DiveState {
  return {
    visits: { konbini: 0, hospital: 0, idol: 0, home: 0, core: 0, blackonyx: 0 },
    metX: false,
    yachiyoTested: false,
    pendingScripts: [],
  };
}

function moduleState(state: { [k: string]: unknown }): DiveState {
  const s = state[MODULE_ID];
  if (!s) throw new Error(`${MODULE_ID}: state missing — initialize hook didn't run?`);
  return s as DiveState;
}

// Pick one of `weights.length` indices, with the given probability weights.
function weightedPick(rng: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ----------------------------------------------------------------------------
// Node-specific dive outcomes. Each returns the per-roll deltas + narration.
// Common cost: stamina -1 (subtracted by handler, not by per-node fn).
// ----------------------------------------------------------------------------

type Outcome = { deltas: StateDelta; narration: string };

function diveKonbini(rng: () => number): Outcome {
  // Mainly motor data. Tiny chance of x_intel bump (loitering data of
  // a similar-frame avatar).
  const roll = weightedPick(rng, [55, 30, 12, 3]);
  if (roll === 0)
    return {
      deltas: { stats: { data_motor: 5 } },
      narration: "POS 协议里翻出几段步态记录。+5 运动模型。",
    };
  if (roll === 1)
    return {
      deltas: { stats: { data_motor: 9, funds: -1 } },
      narration: "扫描枪固件被你重写了——找到一组完整的手部轨迹，但触发了报警，赔了一份盒饭。+9 运动 / -1 资金。",
    };
  if (roll === 2)
    return {
      deltas: { stats: { data_motor: 2, data_voice: 3 } },
      narration: "店员闲聊被录进 POS 日志。声纹意外加成。+2 运动 / +3 声纹。",
    };
  return {
    deltas: { stats: { data_motor: 7, x_intel: 8 } },
    narration: "凌晨三点的收银监控里有一个长得像你的女人路过。她没买东西。+7 运动 / +8 X 线索。",
  };
}

function diveHospital(rng: () => number): Outcome {
  // High-value neural, with bigger risk.
  const roll = weightedPick(rng, [40, 35, 20, 5]);
  if (roll === 0)
    return {
      deltas: { stats: { data_neural: 12, stamina: -1 } },
      narration: "脑机接口测试样本一整批被你拷走。+12 神经映射 / -1 心力。",
    };
  if (roll === 1)
    return {
      deltas: { stats: { data_neural: 18, data_motor: 4 } },
      narration: "运动皮层与小脑映射的全套基线。这正是辉夜缺的那块。+18 神经 / +4 运动。",
    };
  if (roll === 2)
    return {
      deltas: { stats: { data_neural: 6, funds: -8 } },
      narration: "防火墙抬头瞥了你一眼。你假装是 IT 部然后塞了点钱。+6 神经 / -8 资金。",
    };
  return {
    deltas: { stats: { data_neural: 3, engineering: -5 } },
    narration: "蜜罐。你被请去喝茶。本学期讲座资格丢了。+3 神经 / -5 工学。",
  };
}

function diveIdol(rng: () => number): Outcome {
  // Voice-focused; this is where X most often gets spotted.
  const roll = weightedPick(rng, [45, 25, 20, 10]);
  if (roll === 0)
    return {
      deltas: { stats: { data_voice: 10 } },
      narration: "顶流主播的喉部共振模型，自己往你手心里掉。+10 声纹。",
    };
  if (roll === 1)
    return {
      deltas: { stats: { data_voice: 6, x_intel: 12 } },
      narration: "X 的后台直播缓存。她唱歌时的共振模型和你高度相似——这绝不是巧合。+6 声纹 / +12 X 线索。",
    };
  if (roll === 2)
    return {
      deltas: { stats: { data_voice: 14, stamina: -1 } },
      narration: "整夜泡在虚拟混音棚里。你把那首没写完的歌补完了。+14 声纹 / -1 心力。",
    };
  return {
    deltas: { stats: { data_voice: 7, data_memory: 3, x_intel: 5 } },
    narration: "八千代直播的旧存档里夹了一段不属于她的旋律。是辉夜的。也是 X 的。+7 声纹 / +3 记忆 / +5 X 线索。",
  };
}

function diveHome(_rng: () => number): Outcome {
  // Safe, low-yield. Deterministic small all-around gain.
  return {
    deltas: { stats: { data_motor: 2, data_neural: 2, data_voice: 2, stamina: 1 } },
    narration: "扫地机器人和冰箱的固件被你彻底翻了一遍。安全节点，回了点心力。+2 各类 / +1 心力。",
  };
}

function diveCore(rng: () => number): Outcome {
  // Only place memory comes from. Bond up, but she fades a little each time.
  const roll = weightedPick(rng, [40, 35, 20, 5]);
  if (roll === 0)
    return {
      deltas: { stats: { data_memory: 8, bond: 1, funds: -3 } },
      narration: "白色空间里，辉夜抬头看你。她讲了一段你不记得的童年。+8 记忆 / +1 心连 / -3 资金。",
    };
  if (roll === 1)
    return {
      deltas: { stats: { data_memory: 12, bond: 1 } },
      narration: "她哼了一首很短的曲子。你录下来，她笑了笑就消散了。+12 记忆 / +1 心连。",
    };
  if (roll === 2)
    return {
      deltas: { stats: { data_memory: 5, bond: 2, data_voice: 4 } },
      narration: "她说，今天能不能多待一会。你陪她坐到下次系统例行重启。+5 记忆 / +2 心连 / +4 声纹。",
    };
  return {
    deltas: { stats: { data_memory: 15, bond: -1 } },
    narration: "她突然认不出你了。看着你的眼睛和看路灯一样。记忆吐出来很多，但今天她没回来。+15 记忆 / -1 心连。",
  };
}

function diveBlackonyx(rng: () => number): Outcome {
  // Brother's esports team servers — ceiling for motor data, side voice.
  const roll = weightedPick(rng, [50, 30, 15, 5]);
  if (roll === 0)
    return {
      deltas: { stats: { data_motor: 14 } },
      narration: "Black onyX 主力的手部抽帧。+14 运动模型。",
    };
  if (roll === 1)
    return {
      deltas: { stats: { data_motor: 20, data_neural: 6 } },
      narration: "队内复盘录像 + 实时反应基线。整套完整数据。+20 运动 / +6 神经。",
    };
  if (roll === 2)
    return {
      deltas: { stats: { data_motor: 10, data_voice: 8 } },
      narration: "团队语音的实战录音。骂队友的也算声纹。+10 运动 / +8 声纹。",
    };
  return {
    deltas: { stats: { data_motor: 8 }, affection: { asahi: -1 } },
    narration: "你在哥哥的私聊里翻到一句——她最近有点不对。+8 运动 / 哥哥心里有点数。",
  };
}

const NODE_TABLE: Record<NodeId, (rng: () => number) => Outcome> = {
  konbini: diveKonbini,
  hospital: diveHospital,
  idol: diveIdol,
  home: diveHome,
  core: diveCore,
  blackonyx: diveBlackonyx,
};

function nodeFromActionId(id: string): NodeId | undefined {
  if (!id.startsWith("dive_")) return undefined;
  const key = id.slice(5) as NodeId;
  return key in NODE_TABLE ? key : undefined;
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------

const diveHandler: ActionHandler = (ctx: ActionContext): ActionResult => {
  const node = nodeFromActionId(ctx.action.id);
  if (!node) {
    return { narrations: [`未知潜行节点：${ctx.action.id}`] };
  }
  const m = moduleState(ctx.state);
  m.visits[node] += 1;

  const outcome = NODE_TABLE[node](ctx.rng);
  // Always charge 1 stamina (except home, which restores; net handled per-node).
  const stamCost = node === "home" ? 0 : -1;
  const baseStats: Record<string, number> = stamCost ? { stamina: stamCost } : {};
  const mergedStats = { ...baseStats, ...(outcome.deltas.stats ?? {}) };
  // Re-sum stamina if both base and per-outcome wrote it.
  if (stamCost && outcome.deltas.stats?.stamina !== undefined) {
    mergedStats.stamina = stamCost + outcome.deltas.stats.stamina;
  }

  return {
    deltas: { ...outcome.deltas, stats: mergedStats },
    narrations: [`[潜行 · ${nodeLabel(node)}] ${outcome.narration}`],
  };
};

function nodeLabel(node: NodeId): string {
  return {
    konbini: "便利店收银网",
    hospital: "医院神经科",
    idol: "偶像直播间",
    home: "自家家电",
    core: "月读核心",
    blackonyx: "Black onyX 战队后端",
  }[node];
}

// ----------------------------------------------------------------------------
// Triggers — fire scripts when story milestones cross.
// Hide the launched scripts from the hub menu by giving them an
// unreachable `requires:` in their .md frontmatter.
// ----------------------------------------------------------------------------

// Triggers fire on rising-edge once each. If currentScriptId is busy when
// we fire, the script can't start — and with once: true it never retries.
// So we promote-or-defer: take currentScriptId if free, otherwise queue
// to module state and let drainPending pick it up later.
function queueScript(ctx: PresetContext, scriptId: string): void {
  if (ctx.state.baseline.currentScriptId === null) {
    ctx.state.baseline.currentScriptId = scriptId;
    ctx.state.baseline.beatIndex = 0;
    return;
  }
  const m = moduleState(ctx.state);
  if (!m.pendingScripts.includes(scriptId)) {
    m.pendingScripts.push(scriptId);
  }
}

function drainPending(ctx: PresetContext): void {
  if (ctx.state.baseline.currentScriptId !== null) return;
  const m = moduleState(ctx.state);
  while (m.pendingScripts.length > 0) {
    const next = m.pendingScripts.shift()!;
    // Skip if already completed (could happen if seeded fixture marks done).
    if (ctx.state.baseline.scripts[next]?.completed === true) continue;
    if (!ctx.scriptMap.has(next)) continue;
    ctx.state.baseline.currentScriptId = next;
    ctx.state.baseline.beatIndex = 0;
    return;
  }
}

const triggers: Trigger[] = [
  // ——— 第一年 ———
  // 闺蜜上线：开场结束后的第一次 hub iteration 就触发。
  {
    id: "friends_first",
    once: true,
    when: { scriptCompleted: "001_intro" },
    do: (ctx) => {
      queueScript(ctx, "evt_friends_first");
      return {};
    },
  },
  // 哥哥首联系：第一年夏天(day 1, slot 1+)。
  {
    id: "asahi_first",
    once: true,
    when: {
      all: [
        { scriptCompleted: "evt_friends_first" },
        { day: { min: 1 } },
        { slot: { min: 1 } },
      ],
    },
    do: (ctx) => {
      queueScript(ctx, "evt_asahi_first");
      return {};
    },
  },
  // ——— 第二年 ———
  // X 浮出水面：x_intel 攒到 15。
  {
    id: "x_first_seen",
    once: true,
    when: { stat: { name: "x_intel", min: 15 } },
    do: (ctx) => {
      const m = moduleState(ctx.state);
      m.metX = true;
      queueScript(ctx, "evt_x_first_seen");
      return {};
    },
  },
  // 闺蜜察觉：第二年某个时点。
  {
    id: "friends_suspect",
    once: true,
    when: {
      all: [
        { day: { min: 2 } },
        { scriptCompleted: "evt_friends_first" },
      ],
    },
    do: (ctx) => {
      queueScript(ctx, "evt_friends_suspect");
      return {};
    },
  },
  // 八千代试探：核心去深了 + bond 到位。
  {
    id: "yachiyo_test",
    once: true,
    when: {
      all: [
        { stat: { name: "data_memory", min: 30 } },
        { stat: { name: "bond", min: 5 } },
      ],
    },
    do: (ctx) => {
      const m = moduleState(ctx.state);
      m.yachiyoTested = true;
      queueScript(ctx, "evt_yachiyo_test");
      return {};
    },
  },
  // ——— 第三年（剧情高潮）———
  // 通电前夜：4 类数据各自过 40。给一波 stat 增益作为奖励，并把"通电前夜"
  // 这一刻郑重表达出来。
  {
    id: "body_almost_ready",
    once: true,
    when: {
      all: [
        { stat: { name: "data_neural", min: 40 } },
        { stat: { name: "data_motor",  min: 40 } },
        { stat: { name: "data_voice",  min: 40 } },
        { stat: { name: "data_memory", min: 40 } },
      ],
    },
    do: (ctx) => {
      queueScript(ctx, "evt_body_almost");
      return {
        // 闺蜜送来便当 + 哥哥给了一笔过冬费。
        deltas: { stats: { stamina: 5, funds: 15 } },
      };
    },
  },
];

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------

const moonDive: Module = {
  id: MODULE_ID,
  version: "0.1.0",
  initialize: () => initial(),
  provides: ["dive"],
  actionHandlers: { dive: diveHandler },
  triggers,
  onSessionStart: (ctx) => {
    // Auto-queue the intro on first run, same pattern as sengoku-raid.
    if (
      ctx.state.baseline.scripts["001_intro"]?.completed !== true &&
      ctx.scriptMap.has("001_intro") &&
      ctx.state.baseline.currentScriptId === null
    ) {
      ctx.state.baseline.currentScriptId = "001_intro";
      ctx.state.baseline.beatIndex = 0;
    }
  },
  // Both hooks drain pending because either one can free currentScriptId:
  // onScriptComplete fires when a trigger-queued script finishes (chain
  // case), onActionComplete fires when a hub action finishes (the more
  // common "trigger fired during a script, deferred, now hub-time" case).
  onScriptComplete: (ctx) => drainPending(ctx),
  onActionComplete: (ctx) => drainPending(ctx),
};

export default moonDive;
