// ========================= 模型可行性校验 =========================
// 目标：run-model 前对自定义模型做数值可行性检测，
// 通过"检测 → 修改 → 再检测"循环自动修复可修复的参数性灭绝；
// 只有生态学必然灭绝（如鲸落：无生产者/一次性资源）才标记 structural-extinction。
// 注意：本模块为纯函数（不依赖 React/Worker），可直接被 node 测试脚本引用。

import type { SpeciesDef, RelationDef } from "../eco/types";
import { computeStep } from "../eco/computeStep";

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

// ==== 曲线不可区分度（"糊在一起"）检测的数学度量 ====
// 设计原则（用户确认）：检测层不做 feature/bug 判断——只返回定量证据 +
// 无歧义的"完全重回"硬标记；重合度高是 feature 还是 bug 由 agent 泛化能力判断。
// 关键：贴地 / 全部死亡 / 接近灭绝（如鲸落收尾）必须豁免——只统计
// "两者都健康存活"的步，并额外要求稳定期均值远离 minValue（健康共存）。
/** 瞬时相对差 < 该比例视为"贴合" */
const OVERLAP_RATIO = 0.05;
/** 存活判定：种群 > minValue × 该因子才算存活（贴地不算） */
const ALIVE_FACTOR = 2;
/** 健康共存：稳定期平均种群 > minValue × 该因子（远离贴地/接近灭绝） */
const MIN_HEALTH_FACTOR = 3;
/** 全程共同存活比例下限：低于则视为崩溃/错峰/灭绝，豁免 */
const MIN_FULL_ALIVE = 0.3;
/** 稳定期贴合比例下限：高于才判"完全重回"（两条曲线无法区分） */
const CLOSE_FRAC = 0.9;

/** 竞争对曲线不可区分度检测结果（透传给 LLM 作证据） */
export interface CurveOverlapResult {
  species1: string;
  species2: string;
  /** 完全重回硬标记：健康共存 + 稳定期曲线几乎全程重合（对称竞争直接信号） */
  coincident: boolean;
  /** 全程两者共同存活比例（< MIN_FULL_ALIVE 则崩溃/错峰/灭绝） */
  fullBothAliveFrac: number;
  /** 稳定期贴合比例（两条曲线瞬时相对差 < OVERLAP_RATIO 的步占比） */
  stableCloseFrac: number;
  /** 稳定期最大瞬时相对差 */
  maxRelDiff: number;
  /** 稳定期平均种群（用于判断是否贴地/接近灭绝） */
  stableMean: [number, number];
  /** 豁免原因（供 agent 理解为何不判糊） */
  reason: string;
}

/**
 * 检测竞争曲线是否"糊在一起"（对称竞争的典型症状），并返回定量证据。
 * 三层层级判断（每一层都豁免掉一类该豁免的场景）：
 * 1. 全程共同存活比例过低 → 崩溃/错峰/灭绝（如鲸落各阶段）→ 豁免
 * 2. 稳定期平均种群贴地（≤ MIN_HEALTH_FACTOR×minValue）→ 接近灭绝 → 豁免
 * 3. 稳定期贴合比例 ≤ CLOSE_FRAC → 类对称反相振荡/有区分度 → 豁免
 * 只有三层全过（健康共存 + 完全重回）才标 coincident=true。
 * 注意：检测层**不判断 feature/bug**——反相振荡、错峰灭绝等是合法生态现象，
 * 是否值得调整由 LLM 根据重合度证据 + 用户上下文泛化判断。
 */
export function detectCurveOverlap(
  species: SpeciesDef[],
  relations: RelationDef[],
  params: Record<string, number>,
): CurveOverlapResult[] {
  const DT = 0.045;
  const STEPS = 4000;
  const pairs = relations.filter(
    (r): r is RelationDef & { species1: string; species2: string } =>
      r.type === "competition" && !!r.species1 && !!r.species2,
  );
  if (pairs.length === 0) return [];
  const byId = new Map(species.map((s) => [s.id, s]));

  // 完整模拟，记录每条曲线（供逐步统计）
  const series: Record<string, number[]> = {};
  for (const s of species) series[s.id] = [];
  const pops: Record<string, number> = {};
  for (const s of species) pops[s.id] = params[`${s.id.charAt(0).toUpperCase()}${s.id.slice(1)}0`] ?? s.initial;
  for (let i = 0; i < STEPS; i++) {
    const next = computeStep(species, relations, params, pops, DT);
    for (const s of species) {
      pops[s.id] = next[s.id] ?? s.minValue;
      series[s.id].push(pops[s.id]);
    }
  }

  const results: CurveOverlapResult[] = [];
  for (const r of pairs) {
    const ser1 = series[r.species1];
    const ser2 = series[r.species2];
    const min1 = byId.get(r.species1)?.minValue ?? 0.5;
    const min2 = byId.get(r.species2)?.minValue ?? 0.5;
    const n = Math.min(ser1.length, ser2.length);
    const stableStart = Math.floor(n * 0.75);
    const alive = (v: number, m: number) => v > m * ALIVE_FACTOR;

    // 全程共同存活步数
    let fullBothAlive = 0;
    for (let t = 0; t < n; t++) {
      if (alive(ser1[t], min1) && alive(ser2[t], min2)) fullBothAlive++;
    }
    const fullBothAliveFrac = fullBothAlive / n;

    // 稳定期：健康检查 + 瞬时贴合比例 + 最大相对差
    let stableBothAlive = 0, stableClose = 0, maxRelDiff = 0;
    let sum1 = 0, sum2 = 0;
    for (let t = stableStart; t < n; t++) {
      const s1 = ser1[t], s2 = ser2[t];
      const a1 = alive(s1, min1), a2 = alive(s2, min2);
      if (a1 && a2) {
        stableBothAlive++;
        const relDiff = Math.abs(s1 - s2) / Math.max(s1, s2, 1e-6);
        if (relDiff < OVERLAP_RATIO) stableClose++;
        if (relDiff > maxRelDiff) maxRelDiff = relDiff;
      }
      sum1 += s1; sum2 += s2;
    }
    const stableCount = n - stableStart;
    const stableMean1 = sum1 / stableCount;
    const stableMean2 = sum2 / stableCount;
    const healthy = stableMean1 > min1 * MIN_HEALTH_FACTOR && stableMean2 > min2 * MIN_HEALTH_FACTOR;
    const stableCloseFrac = stableBothAlive > 0 ? stableClose / stableBothAlive : 0;

    const coincident = fullBothAliveFrac >= MIN_FULL_ALIVE && healthy && stableCloseFrac > CLOSE_FRAC;

    let reason: string;
    if (coincident) reason = "健康共存且完全重回";
    else if (fullBothAliveFrac < MIN_FULL_ALIVE) reason = `豁免:共同存活期过短(崩溃/错峰) ${fullBothAliveFrac.toFixed(2)}`;
    else if (!healthy) reason = `豁免:接近灭绝/贴地(稳定期均值 ${stableMean1.toFixed(1)}/${stableMean2.toFixed(1)}, min=${min1})`;
    else reason = `豁免:稳定期未完全重合(贴合比例${stableCloseFrac.toFixed(2)})`;

    results.push({
      species1: r.species1,
      species2: r.species2,
      coincident,
      fullBothAliveFrac: +fullBothAliveFrac.toFixed(3),
      stableCloseFrac: +stableCloseFrac.toFixed(3),
      maxRelDiff: +maxRelDiff.toFixed(4),
      stableMean: [+stableMean1.toFixed(1), +stableMean2.toFixed(1)],
      reason,
    });
  }
  return results;
}

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
  // 使用共享的 computeStep 函数确保与 derivatives.ts 逻辑完全一致。
  const simulate = (p: Record<string, number>): { extinct: string[]; meanPops: Record<string, number> } => {
    const pops: Record<string, number> = {};
    for (const s of species) pops[s.id] = p[`${s.id.charAt(0).toUpperCase()}${s.id.slice(1)}0`] ?? s.initial;
    // 稳定期累加（后 1/4 时间段，用于计算平均种群做生态金字塔检查）
    const sums: Record<string, number> = {};
    let counted = 0;
    for (let i = 0; i < STEPS; i++) {
      // 委托给共享的 computeStep，消除方程重复
      const nextPops = computeStep(species, relations, p, pops, DT);
      for (const s of species) pops[s.id] = nextPops[s.id] ?? s.minValue;
      
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
      // 沿捕食链向上追索：猎物的再生来源
      for (const prey of preyOf.get(id) ?? []) {
        if (hasRenewableSource(prey, visited)) return true;
      }
      // 竞争/互利关系：对手物种若有自增长（如"营养液"被建成 hasLogistic 的资源），
      // 则该灭绝物种通过竞争/互利对象也间接拥有能量来源（非结构性必然灭绝）。
      // 例如 Gause 实验中草履虫竞争培养液：营养液(hasLogistic) 是竞争对手，
      // 草履虫灭绝是参数性（竞争强度/初始值）而非"无生产者"的结构性灭绝。
      for (const r of relations) {
        if (r.type !== "predation" && (r.species1 === id || r.species2 === id)) {
          const otherId = r.species1 === id ? r.species2 : r.species1;
          if (otherId && hasRenewableSource(otherId, visited)) return true;
        }
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
