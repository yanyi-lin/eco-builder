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

  // 一次模拟：返回灭绝物种 id 列表 + 各物种稳定期平均种群。
  // 灭绝：100 步后贴地判定灭绝（extinct 非空）；无灭绝则 extinct 为空，meanPops 为稳定均值。
  const simulate = (p: Record<string, number>): { extinct: string[]; meanPops: Record<string, number> } => {
    const pops: Record<string, number> = {};
    for (const s of species) pops[s.id] = p[`${s.id.charAt(0).toUpperCase()}${s.id.slice(1)}0`] ?? s.initial;
    // 稳定期累加（后 1/4 时间段，用于计算平均种群做生态金字塔检查）
    const sums: Record<string, number> = {};
    let counted = 0;
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
        if (r.type === "predation") {
          const a = p[r.predationRate ?? ""] ?? 0;
          const e = p[r.conversionEfficiency ?? ""] ?? 0;
          const preyN = pops[r.prey ?? ""] ?? 0;
          const predN = pops[r.predator ?? ""] ?? 0;
          d[r.prey ?? ""] = (d[r.prey ?? ""] ?? 0) - a * preyN * predN;
          d[r.predator ?? ""] = (d[r.predator ?? ""] ?? 0) + e * a * preyN * predN;
          if (r.predatorDeathRate) {
            d[r.predator ?? ""] = (d[r.predator ?? ""] ?? 0) - (p[r.predatorDeathRate] ?? 0) * predN;
          }
        } else if (r.type === "competition") {
          // 竞争：species1/species2 相互抑制（与 derivatives.ts 一致）
          const a1 = p[r.coeff1 ?? ""] ?? 0;
          const a2 = p[r.coeff2 ?? ""] ?? 0;
          const n1 = pops[r.species1 ?? ""] ?? 0;
          const n2 = pops[r.species2 ?? ""] ?? 0;
          const interaction = n1 * n2;
          d[r.species1 ?? ""] = (d[r.species1 ?? ""] ?? 0) - a1 * interaction;
          d[r.species2 ?? ""] = (d[r.species2 ?? ""] ?? 0) - a2 * interaction;
        } else if (r.type === "mutualism") {
          // 互利：species1/species2 相互促进（与 derivatives.ts 一致，含饱和项防发散）
          const b1 = p[r.coeff1 ?? ""] ?? 0;
          const b2 = p[r.coeff2 ?? ""] ?? 0;
          const n1 = pops[r.species1 ?? ""] ?? 0;
          const n2 = pops[r.species2 ?? ""] ?? 0;
          // 饱和项：β·N1·N2/(1 + h·N1·N2)，h 取两物种 K 倒数量级，防双线性发散
          const s1 = speciesById.get(r.species1 ?? "");
          const s2 = speciesById.get(r.species2 ?? "");
          const K1 = s1?.carryingCapacity ? (p[s1.carryingCapacity] ?? 200) : 200;
          const K2 = s2?.carryingCapacity ? (p[s2.carryingCapacity] ?? 200) : 200;
          const h = 1 / (K1 * K2);
          const raw = n1 * n2;
          const interaction = raw / (1 + h * raw);
          d[r.species1 ?? ""] = (d[r.species1 ?? ""] ?? 0) + b1 * interaction;
          d[r.species2 ?? ""] = (d[r.species2 ?? ""] ?? 0) + b2 * interaction;
        }
      }
      for (const s of species) {
        const next = pops[s.id] + (d[s.id] ?? 0) * DT;
        pops[s.id] = isFinite(next) ? Math.max(next, s.minValue) : s.minValue;
      }
      if (i > 100) {
        const extinct = species.filter((s) => pops[s.id] <= s.minValue + EXTINCT_EPSILON);
        if (extinct.length > 0) return { extinct: extinct.map((s) => s.id), meanPops: {} };
      }
      // 记录稳定期（后 1/4）平均种群
      if (i > STEPS * 3 / 4) {
        for (const s of species) sums[s.id] = (sums[s.id] ?? 0) + pops[s.id];
        counted++;
      }
    }
    const meanPops: Record<string, number> = {};
    for (const s of species) meanPops[s.id] = counted > 0 ? (sums[s.id] ?? 0) / counted : 0;
    return { extinct: [], meanPops };
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

  // 生态金字塔检查：捕食者的稳定数量应显著少于其猎物（数量金字塔）。
  // 返回不满足的捕食关系列表。这是生态合理性约束（如顶级捕食者不应远多于猎物）。
  const checkPyramid = (meanPops: Record<string, number>): RelationDef[] => {
    const violations: RelationDef[] = [];
    for (const r of relations) {
      if (r.type !== "predation" || !r.predator || !r.prey) continue;
      const prey = meanPops[r.prey] ?? 0;
      const predator = meanPops[r.predator] ?? 0;
      // 捕食者数量 ≥ 猎物数量 → 违反金字塔（生态上罕见）。要求捕食者 < 猎物。
      if (prey > 0 && predator >= prey) violations.push(r);
    }
    return violations;
  };

  // 针对性自动修复：参数性灭绝时，把参数确定性推向"已知稳定域"（收敛式，避免增量微调不收敛）：
  // - 基底/生产者：高增长率 + 中容纳量（保证再生能力）
  // - 中间营养级（消费者）：中等增长率 + 较低容纳量（避免种群爆炸压死基底）
  // - 顶级捕食者（无 logistic）：较高的自然死亡率（通过 predatorDeathRate 体现）+ 较高转化效率
  // - 所有捕食率：压低（降低消费强度）
  // - 初始值：提升到中高位（避免前期振荡触底）
  // - 生态金字塔（pyramidViolations）：捕食者数量 ≥ 猎物数量时，提高捕食者死亡率压制其种群
  // 然后重新检测；若仍未稳定，继续逐轮增强力度，直到修好或确认无法修复。
  const applyFixes = (work: Record<string, number>, extinctIds: string[], pyramidViolations: RelationDef[] = []): boolean => {
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
    // 生态金字塔修复：捕食者数量 ≥ 猎物数量 → 提高捕食者死亡率（每个违规关系 +25%），
    // 直到捕食者数量 < 猎物数量。上限 0.5（避免直接把捕食者压死导致灭绝）。
    for (const r of pyramidViolations) {
      if (!r.predatorDeathRate) continue;
      const key = r.predatorDeathRate;
      if (work[key] !== undefined && work[key] < 0.5) {
        work[key] = Math.min(work[key] * 1.25, 0.5);
        changed = true;
      }
    }    // 灭绝物种的初始值提升到中高位（避免前期触底）；其他物种保持
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

  // === 检测 → 修改 → 再检测 loop（直到灭绝与金字塔都满足 / 确认不可修复） ===
  // 两阶段：阶段1 优先消除灭绝（金字塔约束不参与，避免金字塔修复把捕食者压死误报结构性）；
  //        阶段2 灭绝消除后，温和修复生态金字塔（捕食者数量 ≥ 猎物数量时提高其死亡率）。
  const work = { ...params };
  const MAX_PYRAMID_ROUNDS = 6;

  // ---- 阶段 1：消除灭绝 ----
  let result = simulate(work);
  if (result.extinct.length === 0) {
    // 无灭绝：直接进入金字塔阶段
    result = { extinct: [], meanPops: result.meanPops };
  } else {
    let adjusted = false;
    let stage1Ok = false;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (result.extinct.length > 0 && classifyExtinction(result.extinct) === "structural") {
        const names = result.extinct.map((id) => speciesById.get(id)?.name ?? id);
        return {
          status: "structural-extinction",
          params: work,
          message: adjusted
            ? `已尝试自动调参仍无法避免 ${names.join("、")} 灭绝：该物种无可再生的能量来源（类似鲸落/一次性资源）。`
            : `物种 ${names.join("、")} 必然灭绝：系统中不存在可再生的能量来源（无生产者/自增长物种），这是一次性资源系统（类似鲸落），属生态学必然结局，未自动调整参数。`,
          extinctSpecies: result.extinct,
        };
      }
      if (result.extinct.length === 0) { stage1Ok = true; break; }
      const changed = applyFixes(work, result.extinct, []);
      if (!changed) break;
      adjusted = true;
      result = simulate(work);
    }
    // 阶段1 耗尽仍灭绝：
    // - 若灭绝物种仍有可再生来源（参数问题但修复未收敛）→ 返回 adjusted，如实说明，
    //   绝不建议"添加生产者"（会诱导 agent 扩种；病因在参数而非缺生产者）。
    // - 若灭绝物种确实无可再生来源（真鲸落，已被上方 classifyExtinction 拦截）→ 不会走到这。
    if (!stage1Ok && result.extinct.length > 0) {
      const names = result.extinct.map((id) => speciesById.get(id)?.name ?? id);
      const stillStructural = classifyExtinction(result.extinct) === "structural";
      if (stillStructural) {
        return {
          status: "structural-extinction",
          params: work,
          message: `物种 ${names.join("、")} 无可再生的能量来源（类似鲸落/一次性资源），系统在能量供给上无法持续，属生态学必然结局。`,
          extinctSpecies: result.extinct,
        };
      }
      return {
        status: "adjusted",
        params: work,
        message: `已自动调整参数（捕食率/增长率/死亡率等）但 ${names.join("、")} 在数值上仍难以维持，系统可能表现为数量长期低迷或周期性波动。`,
        extinctSpecies: result.extinct,
      };
    }
  }

  // ---- 阶段 2：消除灭绝后，修复生态金字塔 ----
  // 温和地提高违规捕食者的死亡率，每轮重新检测；若金字塔修复导致灭绝，回退该次修改并接受现状。
  let adjusted = result.extinct.length > 0 ? true : false;
  for (let round = 0; round < MAX_PYRAMID_ROUNDS; round++) {
    const violations = checkPyramid(result.meanPops);
    if (violations.length === 0) {
      // 灭绝已消除 + 金字塔满足
      return {
        status: adjusted ? "adjusted" : "ok",
        params: work,
        ...(adjusted ? { message: "已自动调整参数（降低捕食率/提升增长率/调整死亡率等）以保证系统可持续运行" } : {}),
        extinctSpecies: [],
      };
    }
    const before = { ...work };
    const changed = applyFixes(work, [], violations);
    if (!changed) break;
    const after = simulate(work);
    if (after.extinct.length > 0) {
      // 金字塔修复导致灭绝 → 回退，接受当前（金字塔可能不完美）
      for (const k of Object.keys(work)) work[k] = before[k];
      adjusted = true;
      break;
    }
    adjusted = true;
    result = after;
  }
  // 金字塔无法在 6 轮内完全满足（捕食者死亡率已到上限）→ 仍返回 adjusted，但提示金字塔异常
  const violations = checkPyramid(result.meanPops);
  if (violations.length > 0) {
    const vNames = violations.map((r) => `${speciesById.get(r.predator!)?.name ?? r.predator} 数量 ≥ ${speciesById.get(r.prey!)?.name ?? r.prey}`).join("、");
    return {
      status: "adjusted",
      params: work,
      message: `已自动调整参数使系统稳定，但 ${vNames}（生态金字塔关系异常，捕食者死亡率已调至上限仍无法压制其种群）`,
      extinctSpecies: [],
    };
  }
  return {
    status: adjusted ? "adjusted" : "ok",
    params: work,
    ...(adjusted ? { message: "已自动调整参数以保证系统可持续运行" } : {}),
    extinctSpecies: [],
  };
}
