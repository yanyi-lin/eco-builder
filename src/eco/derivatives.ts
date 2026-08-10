import type {
  EcoModelSpec,
  EcoParams,
  Populations,
  Derivatives,
} from "./types";
import { computeStep } from "./computeStep";

/**
 * 按 EcoModelSpec 动态计算各物种的 dN/dt。
 * 
 * 委托给共享的 computeStep 函数，确保与 feasibility.ts 逻辑一致。
 * 返回导数（dN/dt）而非更新后的种群，供 useEcoSimulation 进行 Euler 积分。
 */
export function derivatives(
  spec: EcoModelSpec,
  params: EcoParams,
  pops: Populations,
): Derivatives {
  const dt = 1; // 单位步长，仅计算导数
  // skipClamp: 需要 unclamped 值来正确恢复导数，否则 clamp 会截断大负值导数
  const next = computeStep(spec.species, spec.relations, params, pops, dt, { skipClamp: true });

  // 将 next 转换回导数形式：d = (next - current) / dt
  const d: Derivatives = {};
  for (const s of spec.species) {
    d[s.id] = (next[s.id] ?? 0) - (pops[s.id] ?? 0);
  }
  return d;
}
