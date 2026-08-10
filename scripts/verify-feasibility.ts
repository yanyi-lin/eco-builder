// 验证 ensureFeasible 的灭绝分类与修复循环（直接测试真实源码，经 esbuild bundle）
import { ensureFeasible } from "../src/tools/feasibility";

const DT = 0.045;

function makeSpecies(id: string, name: string, opts: { hasLogistic: boolean; growthRate?: string; carryingCapacity?: string; deathRate?: string; initial: number }): any {
  return { id, name, color: "#000", axis: "right", minValue: 0.5, initial: opts.initial, hasLogistic: opts.hasLogistic, growthRate: opts.growthRate, carryingCapacity: opts.carryingCapacity, deathRate: opts.deathRate };
}

let pass = 0, fail = 0;
function check(label: string, got: string, expected: string) {
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} [${label}] got=${got} expected=${expected}`);
  if (!ok) process.exitCode = 1;
}

// 场景1: 鲸落（鲸尸无logistic + 食腐生物无logistic，鲸尸被食腐生物吃光）→ structural
{
  const species = [
    makeSpecies("whalefall", "鲸尸", { hasLogistic: false, initial: 100 }),
    makeSpecies("scavenger", "食腐生物", { hasLogistic: false, initial: 30 }),
  ];
  const relations = [{ type: "predation", prey: "whalefall", predator: "scavenger", predationRate: "whalefall_scavenger_a", conversionEfficiency: "whalefall_scavenger_e", predatorDeathRate: "whalefall_scavenger_m" }];
  const params: Record<string, number> = { Whalefall0: 100, Scavenger0: 30, whalefall_scavenger_a: 0.03, whalefall_scavenger_e: 0.68, whalefall_scavenger_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  check("场景1 鲸落 → structural-extinction", res.status, "structural-extinction");
}

// 场景2: 草→兔→狼 参数坏（捕食率 0.05 过高）→ adjusted（自动修复循环）
{
  const species = [
    makeSpecies("grass", "草", { hasLogistic: true, growthRate: "grass_r", carryingCapacity: "grass_K", initial: 80 }),
    makeSpecies("rabbit", "兔", { hasLogistic: true, growthRate: "rabbit_r", carryingCapacity: "rabbit_K", initial: 50 }),
    makeSpecies("wolf", "狼", { hasLogistic: false, initial: 20 }),
  ];
  const relations = [
    { type: "predation", prey: "grass", predator: "rabbit", predationRate: "grass_rabbit_a", conversionEfficiency: "grass_rabbit_e" },
    { type: "predation", prey: "rabbit", predator: "wolf", predationRate: "rabbit_wolf_a", conversionEfficiency: "rabbit_wolf_e", predatorDeathRate: "rabbit_wolf_m" },
  ];
  const params: Record<string, number> = { Grass0: 80, Rabbit0: 50, Wolf0: 20, grass_r: 0.3, grass_K: 200, rabbit_r: 0.3, rabbit_K: 200, grass_rabbit_a: 0.05, grass_rabbit_e: 0.68, rabbit_wolf_a: 0.05, rabbit_wolf_e: 0.68, rabbit_wolf_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  check("场景2 草兔狼参数坏 → adjusted", res.status, "adjusted");
}

// 场景3: 草→兔→狼 默认参数其实偏高（模拟中兔/草被吃灭绝）→ 系统自动修复 → adjusted
{
  const species = [
    makeSpecies("grass", "草", { hasLogistic: true, growthRate: "grass_r", carryingCapacity: "grass_K", initial: 80 }),
    makeSpecies("rabbit", "兔", { hasLogistic: true, growthRate: "rabbit_r", carryingCapacity: "rabbit_K", initial: 50 }),
    makeSpecies("wolf", "狼", { hasLogistic: false, initial: 20 }),
  ];
  const relations = [
    { type: "predation", prey: "grass", predator: "rabbit", predationRate: "grass_rabbit_a", conversionEfficiency: "grass_rabbit_e" },
    { type: "predation", prey: "rabbit", predator: "wolf", predationRate: "rabbit_wolf_a", conversionEfficiency: "rabbit_wolf_e", predatorDeathRate: "rabbit_wolf_m" },
  ];
  const params: Record<string, number> = { Grass0: 80, Rabbit0: 50, Wolf0: 20, grass_r: 0.3, grass_K: 200, rabbit_r: 0.3, rabbit_K: 200, grass_rabbit_a: 0.015, grass_rabbit_e: 0.68, rabbit_wolf_a: 0.015, rabbit_wolf_e: 0.68, rabbit_wolf_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  // 默认参数下存在灭绝，但修复循环成功挽救 → adjusted（不是 ok）
  check("场景3 草兔狼默认参数→自动修复→adjusted", res.status, "adjusted");
}

// 场景4: 鲸落 + 海藻（生产者），鲸尸被吃光但海藻存在 → 捕食链有可再生产者
//   鲸尸无logistic但被吃光（灭绝），但系统有海藻（logistic）作为可再生基底 → 鲸尸仍会灭绝（它本身无来源）
//   海藻是独立生产者，与鲸尸无关 → 鲸尸仍结构性灭绝
{
  const species = [
    makeSpecies("algae", "海藻", { hasLogistic: true, growthRate: "algae_r", carryingCapacity: "algae_K", initial: 80 }),
    makeSpecies("whalefall", "鲸尸", { hasLogistic: false, initial: 100 }),
    makeSpecies("scavenger", "食腐生物", { hasLogistic: false, initial: 30 }),
  ];
  const relations = [{ type: "predation", prey: "whalefall", predator: "scavenger", predationRate: "whalefall_scavenger_a", conversionEfficiency: "whalefall_scavenger_e", predatorDeathRate: "whalefall_scavenger_m" }];
  const params: Record<string, number> = { Algae0: 80, Whalefall0: 100, Scavenger0: 30, algae_r: 0.3, algae_K: 200, whalefall_scavenger_a: 0.03, whalefall_scavenger_e: 0.68, whalefall_scavenger_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  // 鲸尸无自身来源且无猎物链到海藻 → structural（海藻不进入鲸尸的捕食链）
  check("场景4 鲸落+无关生产者 → structural", res.status, "structural-extinction");
}

// 场景5: 兔子死亡灭绝（用户举例）— 兔有 logistic 但初始极小 + 被捕食率过高 → 参数性，应被修复为 adjusted
{
  const species = [
    makeSpecies("grass", "草", { hasLogistic: true, growthRate: "grass_r", carryingCapacity: "grass_K", initial: 100 }),
    makeSpecies("rabbit", "兔", { hasLogistic: true, growthRate: "rabbit_r", carryingCapacity: "rabbit_K", initial: 2 }),
    makeSpecies("wolf", "狼", { hasLogistic: false, initial: 25 }),
  ];
  const relations = [
    { type: "predation", prey: "grass", predator: "rabbit", predationRate: "grass_rabbit_a", conversionEfficiency: "grass_rabbit_e" },
    { type: "predation", prey: "rabbit", predator: "wolf", predationRate: "rabbit_wolf_a", conversionEfficiency: "rabbit_wolf_e", predatorDeathRate: "rabbit_wolf_m" },
  ];
  const params: Record<string, number> = { Grass0: 100, Rabbit0: 2, Wolf0: 25, grass_r: 0.3, grass_K: 200, rabbit_r: 0.3, rabbit_K: 200, grass_rabbit_a: 0.02, grass_rabbit_e: 0.68, rabbit_wolf_a: 0.03, rabbit_wolf_e: 0.68, rabbit_wolf_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  // 兔有可再生来源（自身 logistic）→ 参数性灭绝 → 自动修复 → adjusted
  check("场景5 兔子死亡灭绝 → adjusted", res.status, "adjusted");
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(pass > 0 && fail === 0 ? 0 : 1);
