import type { EcoParams, Populations, Derivatives, SpeciesDef, RelationDef } from "./types";

/**
 * 共享的微分方程单步计算（Euler 法）。
 * 
 * 被 derivatives.ts（实时模拟）和 feasibility.ts（可行性校验）共同使用，
 * 确保两处逻辑完全一致，避免重复维护。
 * 
 * @param species 物种定义列表
 * @param relations 关系定义列表
 * @param params 当前参数值
 * @param pops 当前种群数量
 * @param dt 时间步长
 * @param options.skipClamp 跳过 minValue clamp（derivatives.ts 需要 unclamped 值恢复导数）
 * @returns 更新后的种群数量
 */
export function computeStep(
  species: SpeciesDef[],
  relations: RelationDef[],
  params: EcoParams,
  pops: Populations,
  dt: number,
  options?: { skipClamp?: boolean },
): Populations {
  const d: Derivatives = {};

  // 1. 每物种的自有项（logistic 自限 + 自然死亡率）
  for (const s of species) {
    let rate = 0;
    const N = pops[s.id] ?? 0;

    if (s.hasLogistic && s.growthRate && s.carryingCapacity) {
      const r = params[s.growthRate] ?? 0;
      const K = params[s.carryingCapacity] ?? 1;
      rate += r * N * (1 - N / K);
    }

    if (s.deathRate) {
      const deathRate = params[s.deathRate] ?? 0;
      rate -= deathRate * N;
    }

    d[s.id] = rate;
  }

  // 2. 关系项
  for (const rel of relations) {
    if (rel.type === "predation") {
      const a = params[rel.predationRate ?? ""] ?? 0;
      const e = params[rel.conversionEfficiency ?? ""] ?? 0;
      const preyN = pops[rel.prey ?? ""] ?? 0;
      const predN = pops[rel.predator ?? ""] ?? 0;
      const interaction = a * preyN * predN;

      d[rel.prey ?? ""] = (d[rel.prey ?? ""] ?? 0) - interaction;
      d[rel.predator ?? ""] = (d[rel.predator ?? ""] ?? 0) + e * interaction;

      if (rel.predatorDeathRate) {
        const m = params[rel.predatorDeathRate] ?? 0;
        d[rel.predator ?? ""] = (d[rel.predator ?? ""] ?? 0) - m * predN;
      }
    } else if (rel.type === "competition") {
      const alpha1 = params[rel.coeff1 ?? ""] ?? 0;
      const alpha2 = params[rel.coeff2 ?? ""] ?? 0;
      const n1 = pops[rel.species1 ?? ""] ?? 0;
      const n2 = pops[rel.species2 ?? ""] ?? 0;
      const interaction = n1 * n2;

      d[rel.species1 ?? ""] = (d[rel.species1 ?? ""] ?? 0) - alpha1 * interaction;
      d[rel.species2 ?? ""] = (d[rel.species2 ?? ""] ?? 0) - alpha2 * interaction;
    } else if (rel.type === "mutualism") {
      const beta1 = params[rel.coeff1 ?? ""] ?? 0;
      const beta2 = params[rel.coeff2 ?? ""] ?? 0;
      const n1 = pops[rel.species1 ?? ""] ?? 0;
      const n2 = pops[rel.species2 ?? ""] ?? 0;
      // 互利项采用饱和形式 β·N1·N2/(1 + h·N1·N2)（Holling Type II 风格），
      // 防止双线性正反馈在 β 较大时压倒 logistic 阻尼导致数值发散。
      // h 取两物种容纳量倒数的量级：当 N 接近 K 时互利率自然饱和，数学上有界。
      const species1 = species.find((s) => s.id === rel.species1);
      const species2 = species.find((s) => s.id === rel.species2);
      const K1 = species1?.carryingCapacity ? (params[species1.carryingCapacity] ?? 200) : 200;
      const K2 = species2?.carryingCapacity ? (params[species2.carryingCapacity] ?? 200) : 200;
      const h = 1 / (K1 * K2);
      const raw = n1 * n2;
      const interaction = raw / (1 + h * raw);

      d[rel.species1 ?? ""] = (d[rel.species1 ?? ""] ?? 0) + beta1 * interaction;
      d[rel.species2 ?? ""] = (d[rel.species2 ?? ""] ?? 0) + beta2 * interaction;
    }
  }

  // 3. Euler 积分 + 边界保护
  const next: Populations = {};
  const skipClamp = options?.skipClamp ?? false;
  for (const s of species) {
    const raw = (pops[s.id] ?? 0) + (d[s.id] ?? 0) * dt;
    if (skipClamp) {
      // derivatives.ts 需要 unclamped 值来正确恢复导数
      next[s.id] = isFinite(raw) ? raw : s.minValue;
    } else {
      next[s.id] = isFinite(raw) ? Math.max(raw, s.minValue) : s.minValue;
    }
  }

  return next;
}
