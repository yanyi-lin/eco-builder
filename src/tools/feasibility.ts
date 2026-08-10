// ========================= 模型可行性校验 =========================
// 目标：run-model 前对自定义模型做数值可行性检测，
// 通过"检测 → 修改 → 再检测"循环自动修复可修复的参数性灭绝；
// 只有生态学必然灭绝（如鲸落：无生产者/一次性资源）才标记 structural-extinction。
// 注意：本模块为纯函数（不依赖 React/Worker），可直接被 node 测试脚本引用。

import type { SpeciesDef, RelationDef } from "../eco/types";

/** 可行性状态 */
export type FeasibilityStatus = "ok" | "adjusted" | "structural-extinction";

/** 可行性诊断结果 */
export interface FeasibilityResult {
  status: FeasibilityStatus;
  /** 可能已被自动调整的参数 */
  params: Record<string, number>;
  /** 给用户/LLM 的诊断说明 */
  message?: string;
  /** 灭绝的物种 id 列表（adjusted/structural 时可能有） */
  extinctSpecies?: string[];
}

/** 检测灭绝时使用的物种"灭绝"阈值：种群 ≤ minValue + ε 视为灭绝 */
const EXTINCT_EPSILON = 0.01;

/**
 * 数值可行性校验（纯函数）。
 *
 * 思路（第一性原理）：灭绝的物种需要"能量来源"才能存活——
 * - 自身有 logistic（生产者/自增长）或
 * - 沿捕食链向上追索存在某个有 logistic 的基底（间接生产者）。
 * 若灭绝物种完全无再生来源 → 结构性必然灭绝（如鲸落），参数无法修复，不自动调参。
 * 否则 → 参数性问题（如兔子被过度捕食、初始值过低、死亡率过高等），
 * 自动调整参数后重新检测，循环直到修好（无灭绝）或确认无法通过参数修复。
 */
export function ensureFeasible(
  species: SpeciesDef[],
  relations: RelationDef[],
  params: Record<string, number>,
): FeasibilityResult {
  const DT = 0.045;
  const STEPS = 4000;
  const MIN_PREDATION = 0.002;
  const MAX_ROUNDS = 12;

  const speciesById = new Map(species.map((s) => [s.id, s]));
  // 预处理：每个捕食者的猎物列表（用于沿捕食链追索能量来源）
  const preyOf = new Map<string, string[]>();
  for (const r of relations) {
    if (r.type !== "predation" || !r.predator || !r.prey) continue;
    const list = preyOf.get(r.predator) ?? [];
    list.push(r.prey);
    preyOf.set(r.predator, list);
  }

  // 一次模拟：返回灭绝物种 id 列表（100 步后贴地判定灭绝）；无灭绝返回空数组
  const simulate = (p: Record<string, number>): string[] => {
    const pops: Record<string, number> = {};
    for (const s of species) pops[s.id] = p[`${s.id.charAt(0).toUpperCase()}${s.id.slice(1)}0`] ?? s.initial;
    for (let i = 0; i < STEPS; i++) {
      const d: Record<string, number> = {};
      for (const s of species) {
        let rate = 0;
        if (s.hasLogistic && s.growthRate && s.carryingCapacity) {
          rate += (p[s.growthRate] ?? 0) * pops[s.id] * (1 - pops[s.id] / (p[s.carryingCapacity] ?? 1));
        }
        if (s.deathRate) rate -= (p[s.deathRate] ?? 0) * pops[s.id];
        d[s.id] = rate;
      }
      for (const r of relations) {
        if (r.type !== "predation") continue;
        const a = p[r.predationRate ?? ""] ?? 0;
        const e = p[r.conversionEfficiency ?? ""] ?? 0;
        const preyN = pops[r.prey ?? ""] ?? 0;
        const predN = pops[r.predator ?? ""] ?? 0;
        d[r.prey ?? ""] = (d[r.prey ?? ""] ?? 0) - a * preyN * predN;
        d[r.predator ?? ""] = (d[r.predator ?? ""] ?? 0) + e * a * preyN * predN;
        if (r.predatorDeathRate) {
          d[r.predator ?? ""] = (d[r.predator ?? ""] ?? 0) - (p[r.predatorDeathRate] ?? 0) * predN;
        }
      }
      for (const s of species) {
        const next = pops[s.id] + (d[s.id] ?? 0) * DT;
        pops[s.id] = isFinite(next) ? Math.max(next, s.minValue) : s.minValue;
      }
      if (i > 100) {
        const extinct = species.filter((s) => pops[s.id] <= s.minValue + EXTINCT_EPSILON);
        if (extinct.length > 0) return extinct.map((s) => s.id);
      }
    }
    return [];
  };

  // 灭绝原因分类：灭绝物种是否都有可再生能量来源？
  const classifyExtinction = (extinctIds: string[]): "structural" | "adjustable" => {
    const hasRenewableSource = (id: string, visited: Set<string>): boolean => {
      if (visited.has(id)) return false;
      visited.add(id);
      const s = speciesById.get(id);
      if (!s) return false;
      if (s.hasLogistic) return true;
      for (const prey of preyOf.get(id) ?? []) {
        if (hasRenewableSource(prey, visited)) return true;
      }
      return false;
    };
    // 只要有一个灭绝物种无再生来源 → 结构性（生态学必然，参数无法修复）
    for (const id of extinctIds) {
      if (!hasRenewableSource(id, new Set())) return "structural";
    }
    return "adjustable";
  };

  // 针对性自动修复：参数性灭绝时，把参数确定性推向"已知稳定域"（收敛式，避免增量微调不收敛）：
  // - 基底/生产者：高增长率 + 中容纳量（保证再生能力）
  // - 中间营养级（消费者）：中等增长率 + 较低容纳量（避免种群爆炸压死基底）
  // - 顶级捕食者（无 logistic）：较高的自然死亡率（通过 predatorDeathRate 体现）+ 较高转化效率
  // - 所有捕食率：压低（降低消费强度）
  // - 初始值：提升到中高位（避免前期振荡触底）
  // 然后重新检测；若仍未稳定，继续逐轮增强力度，直到修好或确认无法修复。
  const applyFixes = (work: Record<string, number>, extinctIds: string[]): boolean => {
    let changed = false;
    // 营养级分类：真正的"消费者"是出现在捕食关系 predator 位置的物种
    // （它们靠吃别人获取能量）；纯生产者 = hasLogistic 且从未作为 predator。
    // 注意：被捕食者（prey）不是消费者，它们是食物链基底或中间层，不能因被吃而压低其增长。
    const predatorIds = new Set<string>();
    for (const r of relations) {
      if (r.type !== "predation") continue;
      if (r.predator) predatorIds.add(r.predator);
    }
    // 灭绝物种中若有"纯生产者被吃光"或"消费者灭绝" → 需要系统性降捕食率
    for (const id of extinctIds) {
      const s = speciesById.get(id);
      if (!s) continue;
      // 该物种作为被捕食者的所有捕食关系 → 大幅降低捕食率
      for (const r of relations) {
        if (r.type !== "predation" || r.prey !== id) continue;
        if (r.predationRate && work[r.predationRate] !== undefined && work[r.predationRate] > MIN_PREDATION) {
          // 捕食率直接压到接近下限（0.002 → 0.003 附近），比逐轮 ×0.7 收敛更快
          work[r.predationRate] = Math.max(work[r.predationRate] * 0.4, MIN_PREDATION + 0.001);
          changed = true;
        }
      }
    }
    // 系统性调整所有 logistic 物种的增长/容纳量：稳定域策略
    for (const s of species) {
      if (!s.hasLogistic || !s.growthRate || !s.carryingCapacity) continue;
      const isConsumer = predatorIds.has(s.id);
      if (isConsumer) {
        // 消费者（中间营养级/顶级捕食者的可再生产部分）：增长率/容纳量压低到中等，
        // 避免种群爆炸压死基底
        if (work[s.growthRate] !== undefined && work[s.growthRate] > 0.25) {
          work[s.growthRate] = 0.25;
          changed = true;
        }
        if (work[s.carryingCapacity] !== undefined && work[s.carryingCapacity] > 250) {
          work[s.carryingCapacity] = 250;
          changed = true;
        }
      } else {
        // 纯生产者（基底）：增长率提高，容纳量保持（不压低，避免基底更容易灭绝）
        if (work[s.growthRate] !== undefined && work[s.growthRate] < 0.6) {
          work[s.growthRate] = Math.min(work[s.growthRate] * 1.4, 0.8);
          changed = true;
        }
      }
    }
    // 顶级捕食者的自然死亡率（predatorDeathRate）提高 → 抑制顶级捕食者种群
    for (const r of relations) {
      if (r.type !== "predation") continue;
      if (r.predatorDeathRate && work[r.predatorDeathRate] !== undefined && work[r.predatorDeathRate] < 0.2) {
        work[r.predatorDeathRate] = 0.2;
        changed = true;
      }
    }
    // 灭绝物种的初始值提升到中高位（避免前期触底）；其他物种保持
    for (const id of extinctIds) {
      const initKey = `${id.charAt(0).toUpperCase()}${id.slice(1)}0`;
      if (work[initKey] !== undefined && work[initKey] < 200) {
        work[initKey] = Math.min(work[initKey] * 1.5, 250);
        changed = true;
      }
    }
    // 兜底：若完全没改（都已在稳定域但依然灭绝）→ 尝试把捕食率推到下限
    if (!changed) {
      for (const r of relations) {
        if (r.type !== "predation" || !r.predationRate) continue;
        if (work[r.predationRate] !== undefined && work[r.predationRate] > MIN_PREDATION) {
          work[r.predationRate] = MIN_PREDATION;
          changed = true;
        }
      }
    }
    return changed;
  };

  // === 检测 → 修改 → 再检测 loop（直到修好） ===
  const work = { ...params };
  let extinct = simulate(work);
  if (extinct.length === 0) return { status: "ok", params: work };

  let adjusted = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // 每轮都重新分类：一旦灭绝物种无再生来源 → 结构性必然，参数无法修复
    if (classifyExtinction(extinct) === "structural") {
      const names = extinct.map((id) => speciesById.get(id)?.name ?? id);
      return {
        status: "structural-extinction",
        params: work,
        message: adjusted
          ? `已尝试自动调参仍无法避免 ${names.join("、")} 灭绝：该物种无可再生的能量来源（类似鲸落/一次性资源），参数无法修复，可能需要调整模型结构（如添加生产者）。`
          : `物种 ${names.join("、")} 必然灭绝：系统中不存在可再生的能量来源（无生产者/自增长物种），这是一次性资源系统（类似鲸落），属生态学必然结局，未自动调整参数。`,
        extinctSpecies: extinct,
      };
    }
    // 参数性：针对性修改，然后重新检测
    const changed = applyFixes(work, extinct);
    if (!changed) break;
    adjusted = true;
    extinct = simulate(work);
    if (extinct.length === 0) {
      return {
        status: "adjusted",
        params: work,
        message: "已自动调整参数（降低捕食率/提升增长率等）以保证系统可持续运行",
        extinctSpecies: [],
      };
    }
  }
  // 调参至边界仍灭绝：参数无法彻底修复，需要结构调整（不运行模型）
  const names = extinct.map((id) => speciesById.get(id)?.name ?? id);
  return {
    status: "structural-extinction",
    params: work,
    message: `已尝试自动调参（捕食率降至下限 ${MIN_PREDATION}、增长率升至上限）仍无法避免 ${names.join("、")} 灭绝，模型结构可能需要调整（如添加生产者）。`,
    extinctSpecies: extinct,
  };
}
