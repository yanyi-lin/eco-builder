import type {
  EcoModelSpec,
  EcoParams,
  Populations,
  Derivatives,
} from "./types";

/**
 * 按 EcoModelSpec 动态计算各物种的 dN/dt。
 *
 * 通用规则：
 *  - 每物种初始 rate = 0
 *  - hasLogistic 物种：rate += r·N·(1 - N/K)
 *  - 物种 deathRate：rate += -deathRate·N
 *  - predation 关系 (prey, predator)：
 *      d[prey]     += -a·prey·predator
 *      d[predator] += +e·a·prey·predator
 *      若 predatorDeathRate 存在：d[predator] += -m·predator
 *  - competition 关系 (species1, species2)：
 *      d[species1] += -α1·species1·species2
 *      d[species2] += -α2·species1·species2
 *  - mutualism 关系 (species1, species2)：
 *      d[species1] += +β1·species1·species2
 *      d[species2] += +β2·species1·species2
 */
export function derivatives(
  spec: EcoModelSpec,
  params: EcoParams,
  pops: Populations,
): Derivatives {
  const d: Derivatives = {};

  // 1. 每物种的自有项（logistic 自限 + 自然死亡率）
  for (const s of spec.species) {
    let rate = 0;
    const N = pops[s.id] ?? 0;

    if (s.hasLogistic && s.growthRate && s.carryingCapacity) {
      // 参数缺失时按 0 处理（防御 NaN 传播）
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
  for (const rel of spec.relations) {
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
      const interaction = n1 * n2;

      d[rel.species1 ?? ""] = (d[rel.species1 ?? ""] ?? 0) + beta1 * interaction;
      d[rel.species2 ?? ""] = (d[rel.species2 ?? ""] ?? 0) + beta2 * interaction;
    }
  }

  return d;
}
