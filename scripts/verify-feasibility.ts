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

// 场景6: 用户实测模型（草500/兔50/狼10, K 1000/200/50, r 0.5/0.3/0.2）
//   早期 bug：基底"草"被误判为消费者导致 K 被压低到 250、r 被压到 0.25 → 草更易灭绝 → 误报 structural
//   修复后：草_K 保持、草_r 提升、兔被压、捕食率降低 → adjusted
{
  const species = [
    makeSpecies("grass", "草", { hasLogistic: true, growthRate: "grass_r", carryingCapacity: "grass_K", initial: 500 }),
    makeSpecies("rabbit", "兔", { hasLogistic: true, growthRate: "rabbit_r", carryingCapacity: "rabbit_K", initial: 50 }),
    makeSpecies("wolf", "狼", { hasLogistic: false, initial: 10 }),
  ];
  const relations = [
    { type: "predation", prey: "grass", predator: "rabbit", predationRate: "grass_rabbit_a", conversionEfficiency: "grass_rabbit_e" },
    { type: "predation", prey: "rabbit", predator: "wolf", predationRate: "rabbit_wolf_a", conversionEfficiency: "rabbit_wolf_e", predatorDeathRate: "rabbit_wolf_m" },
  ];
  const params: Record<string, number> = { Grass0: 500, Rabbit0: 50, Wolf0: 10, grass_r: 0.5, grass_K: 1000, rabbit_r: 0.3, rabbit_K: 200, grass_rabbit_a: 0.008, grass_rabbit_e: 0.68, rabbit_wolf_a: 0.008, rabbit_wolf_e: 0.68, rabbit_wolf_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  check("场景6 用户实测草兔狼(500/50/10) → adjusted", res.status, "adjusted");
  // 验证基底草未被误压：K 保持 ≥ 500，增长率应提升
  if (res.status === "adjusted") {
    const grassKOk = (res.params.grass_K ?? 0) >= 500;
    const grassROk = (res.params.grass_r ?? 0) >= 0.6;
    const rabbitCapOk = (res.params.rabbit_K ?? 0) <= 250;
    console.log(`  [基底草修复检查] grass_K=${res.params.grass_K} grass_r=${res.params.grass_r} rabbit_K=${res.params.rabbit_K}`);
    if (!grassKOk || !grassROk || !rabbitCapOk) { fail++; process.exitCode = 1; console.log("  FAIL 基底/消费者修复方向错误"); }
    else { pass++; console.log("  PASS 修复方向正确（基底增强、消费者压制）"); }
  }
}

// 场景7: 生态金字塔检查 —— 用户实测模型的修复后参数应满足 兔>狼（捕食者数量<猎物数量）
//   用 ensureFeasible 修复后的参数直接模拟，验证稳定数量满足金字塔。
{
  const DT = 0.045, STEPS = 4000;
  const species = [
    { id: "grass", minValue: 0.5, hasLogistic: true, growthRate: "grass_r", carryingCapacity: "grass_K" },
    { id: "rabbit", minValue: 0.5, hasLogistic: true, growthRate: "rabbit_r", carryingCapacity: "rabbit_K" },
    { id: "wolf", minValue: 0.5, hasLogistic: false },
  ] as any[];
  const relations = [
    { type: "predation", prey: "grass", predator: "rabbit", predationRate: "grass_rabbit_a", conversionEfficiency: "grass_rabbit_e" },
    { type: "predation", prey: "rabbit", predator: "wolf", predationRate: "rabbit_wolf_a", conversionEfficiency: "rabbit_wolf_e", predatorDeathRate: "rabbit_wolf_m" },
  ] as any[];
  const rawParams: Record<string, number> = { Grass0: 500, Rabbit0: 50, Wolf0: 10, grass_r: 0.5, grass_K: 1000, rabbit_r: 0.3, rabbit_K: 200, grass_rabbit_a: 0.008, grass_rabbit_e: 0.68, rabbit_wolf_a: 0.008, rabbit_wolf_e: 0.68, rabbit_wolf_m: 0.08 };
  const res = ensureFeasible(species, relations, rawParams);
  const p = res.params;
  // 模拟稳定期均值
  const pops: Record<string, number> = {};
  for (const s of species) pops[s.id] = p[`${s.id.charAt(0).toUpperCase()}${s.id.slice(1)}0`];
  const sums: Record<string, number> = {}; let counted = 0;
  for (let i = 0; i < STEPS; i++) {
    const d: Record<string, number> = {};
    for (const s of species) {
      let rate = 0;
      if (s.hasLogistic) rate += (p[s.growthRate] ?? 0) * pops[s.id] * (1 - pops[s.id] / (p[s.carryingCapacity] ?? 1));
      if (s.deathRate) rate -= (p[s.deathRate] ?? 0) * pops[s.id];
      d[s.id] = rate;
    }
    for (const r of relations) {
      const a = p[r.predationRate] ?? 0, e = p[r.conversionEfficiency] ?? 0;
      const preyN = pops[r.prey] ?? 0, predN = pops[r.predator] ?? 0;
      d[r.prey] = (d[r.prey] ?? 0) - a * preyN * predN;
      d[r.predator] = (d[r.predator] ?? 0) + e * a * preyN * predN;
      if (r.predatorDeathRate) d[r.predator] = (d[r.predator] ?? 0) - (p[r.predatorDeathRate] ?? 0) * predN;
    }
    for (const s of species) {
      const next = pops[s.id] + (d[s.id] ?? 0) * DT;
      pops[s.id] = isFinite(next) ? Math.max(next, s.minValue) : s.minValue;
    }
    if (i > STEPS * 3 / 4) { for (const s of species) sums[s.id] = (sums[s.id] ?? 0) + pops[s.id]; counted++; }
  }
  const mean = (id: string) => counted > 0 ? (sums[id] ?? 0) / counted : 0;
  const rabbit = mean("rabbit"), wolf = mean("wolf"), grass = mean("grass");
  console.log(`  [金字塔检查] grass=${grass.toFixed(0)} rabbit=${rabbit.toFixed(0)} wolf=${wolf.toFixed(0)}  rabbit>wolf=${rabbit > wolf}`);
  // 金字塔：捕食者 < 猎物（狼<兔），且兔>狼是用户明确要求
  if (rabbit > wolf) { pass++; console.log("  PASS 生态金字塔满足（兔 > 狼）"); }
  else { fail++; process.exitCode = 1; console.log("  FAIL 金字塔不满足（兔 ≤ 狼）"); }
}

// 场景8: 回归测试——修复 loop 未收敛时不再误报 structural-extinction
//   之前 bug：grass_K=50（容纳量太小）→ 狼灭绝，但模型有生产者（草），
//   却被误判 structural 并提示"添加生产者"（诱导 agent 扩种）。
//   修复后：有可再生来源时返回 adjusted（不诱导加物种）。
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
  const params: Record<string, number> = { Grass0: 80, Rabbit0: 50, Wolf0: 20, grass_r: 0.3, grass_K: 50, rabbit_r: 0.3, rabbit_K: 200, grass_rabbit_a: 0.02, grass_rabbit_e: 0.68, rabbit_wolf_a: 0.03, rabbit_wolf_e: 0.68, rabbit_wolf_m: 0.08 };
  const res = ensureFeasible(species, relations, params);
  // 有生产者（草有 logistic）但参数修复未收敛 → 不应返回 structural（会诱导加生产者）
  check("场景8 修复未收敛不误报structural → 非structural", res.status === "structural-extinction" ? "structural-extinction" : "not-structural", "not-structural");
  // 且 message 不应包含"添加生产者"字样
  const msg = res.message ?? "";
  if (msg.includes("添加生产者")) { fail++; process.exitCode = 1; console.log("  FAIL message 仍诱导'添加生产者':", msg); }
  else { pass++; console.log("  PASS message 无'添加生产者'诱导"); }
}

// 场景9: buildModel 轴分配——先添加顶级捕食者（狼）时，左轴应归第一个生产者（草）
//   旧 bug：左轴固定给"第一个添加的物种"（狼），导致捕食者占左轴、缩放错位。
{
  const { buildModel } = await import("../src/tools/builderTools");
  const state = {
    species: [
      { id: "wolf", name: "狼", color: "#111", axis: "right", minValue: 0.5, initial: 10, hasLogistic: false },
      { id: "grass", name: "草", color: "#2e7d32", axis: "right", minValue: 0.5, initial: 80, hasLogistic: true, growthRate: "grass_r", carryingCapacity: "grass_K" },
      { id: "rabbit", name: "兔", color: "#e53935", axis: "right", minValue: 0.5, initial: 50, hasLogistic: true, growthRate: "rabbit_r", carryingCapacity: "rabbit_K" },
    ],
    relations: [
      { type: "predation", prey: "grass", predator: "rabbit", predationRate: "grass_rabbit_a", conversionEfficiency: "grass_rabbit_e" },
      { type: "predation", prey: "rabbit", predator: "wolf", predationRate: "rabbit_wolf_a", conversionEfficiency: "rabbit_wolf_e", predatorDeathRate: "rabbit_wolf_m" },
    ],
    params: {},
    paramMeta: {},
  } as any;
  const model = buildModel(state, "轴分配测试", "");
  if (!model) { fail++; process.exitCode = 1; console.log("FAIL 构建失败"); }
  else {
    const leftSpecies = model.species.filter((s) => s.axis === "left").map((s) => s.name);
    const ok = leftSpecies.length === 1 && leftSpecies[0] === "草";
    if (ok) { pass++; console.log("PASS 左轴归生产者(草):", leftSpecies.join(",")); }
    else { fail++; process.exitCode = 1; console.log("FAIL 左轴分配错误:", leftSpecies.join(",")); }
  }
}

// 场景10: 纯竞争耗竭模型（Gause 草履虫实验）——无 logistic 的竞争物种
//   不应被 buildModel 兜底补成生产者，且 feasibility 判 ok（耗竭是预期行为）
{
  const species = [
    makeSpecies("pc", "大草履虫", { hasLogistic: false, initial: 50 }),
    makeSpecies("pa", "小草履虫", { hasLogistic: false, initial: 50 }),
  ];
  const relations = [
    { type: "competition", species1: "pc", species2: "pa", coeff1: "pc_pa_c1", coeff2: "pc_pa_c2" },
  ];
  const params: Record<string, number> = { Pc0: 50, Pa0: 50, pc_pa_c1: 0.005, pc_pa_c2: 0.005 };
  const res = ensureFeasible(species, relations, params);
  check("场景10 纯竞争耗竭 → 非structural", res.status === "structural-extinction" ? "structural-extinction" : "not-structural", "not-structural");
  // 验证模拟会归零
  const { derivatives } = await import("../src/eco/derivatives");
  const spec = { species, relations, params, dt: 0.045 } as any;
  let pops: Record<string, number> = { pc: 50, pa: 50 };
  for (let i = 0; i < 6000; i++) {
    const d = derivatives(spec, params, pops);
    for (const s of species) {
      let v = pops[s.id] + (d[s.id] ?? 0) * 0.045;
      if (!isFinite(v)) v = s.minValue;
      if (v < s.minValue) v = s.minValue;
      pops[s.id] = v;
    }
  }
  if (pops.pc < 1 && pops.pa < 1) { pass++; console.log("  PASS 两物种接近归零（资源耗竭）"); }
  else { fail++; process.exitCode = 1; console.log(`  FAIL 未耗竭 pc=${pops.pc.toFixed(1)} pa=${pops.pa.toFixed(1)}`); }
}

// 场景11: 互利关系饱和——大 β 互利不应数值发散（回归：β·N1·N2 双线性曾导致爆炸）
{
  const { derivatives } = await import("../src/eco/derivatives");
  const spec = {
    species: [
      { id: "a", minValue: 0.5, hasLogistic: true, growthRate: "r", carryingCapacity: "K" },
      { id: "b", minValue: 0.5, hasLogistic: true, growthRate: "r", carryingCapacity: "K" },
    ],
    relations: [{ type: "mutualism", species1: "a", species2: "b", coeff1: "b1", coeff2: "b2" }],
  } as any;
  const params: Record<string, number> = { A0: 50, B0: 50, r: 0.3, K: 200, b1: 0.05, b2: 0.05 };
  let pops: Record<string, number> = { a: 50, b: 50 };
  let diverged = false;
  for (let i = 0; i < 20000; i++) {
    const d = derivatives(spec, params, pops);
    for (const s of spec.species) {
      let v = pops[s.id] + (d[s.id] ?? 0) * 0.045;
      if (!isFinite(v)) v = s.minValue;
      if (v < s.minValue) v = s.minValue;
      pops[s.id] = v;
    }
    if (pops.a > 1e9 || pops.b > 1e9) { diverged = true; break; }
  }
  if (diverged) { fail++; process.exitCode = 1; console.log("FAIL 互利 β=0.05 发散"); }
  else { pass++; console.log(`  PASS 互利饱和（β=0.05 → a=${pops.a.toFixed(0)}, b=${pops.b.toFixed(0)}）`); }
}

// 场景12: 竞争关系中的自增长资源（营养液）不应误判 structural-extinction
//   用户场景：agent 把"营养液"建成 hasLogistic 组分 + 大小草履虫竞争。
//   旧 bug：classifyExtinction 只沿捕食链找能量来源，忽略 competition 关系，
//   误判"无生产者"→ structural。修复后：营养液(hasLogistic) 是竞争对手，
//   灭绝物种通过它拥有再生来源 → adjustable。
{
  const species = [
    makeSpecies("nutrient", "营养液", { hasLogistic: true, growthRate: "nutrient_r", carryingCapacity: "nutrient_K", initial: 200 }),
    makeSpecies("pc", "大草履虫", { hasLogistic: false, initial: 50 }),
    makeSpecies("pa", "小草履虫", { hasLogistic: false, initial: 50 }),
  ];
  const relations = [
    { type: "competition", species1: "nutrient", species2: "pc", coeff1: "nut_pc_c1", coeff2: "nut_pc_c2" },
    { type: "competition", species1: "nutrient", species2: "pa", coeff1: "nut_pa_c1", coeff2: "nut_pa_c2" },
  ];
  const params: Record<string, number> = { Nutrient0: 200, Pc0: 50, Pa0: 50, nutrient_r: 0.3, nutrient_K: 300, nut_pc_c1: 0.005, nut_pc_c2: 0.005, nut_pa_c1: 0.005, nut_pa_c2: 0.005 };
  const res = ensureFeasible(species, relations, params);
  check("场景12 营养液竞争 → 非structural", res.status === "structural-extinction" ? "structural-extinction" : "not-structural", "not-structural");
}

// 场景13: 顶级捕食者 predatorDeathRate 写回 relation（鲸落崩溃链完整性）
//   旧 bug：addRelationParams 生成了 <pred>_m 参数但没写回 relation.predatorDeathRate，
//   computeStep 的 if(rel.predatorDeathRate) 为 false → 顶级捕食者无死亡项 →
//   食物耗尽后不饿死 → 崩溃链不完整（睡鲨涨到 25848）。
{
  const { addRelationParams } = await import("../src/tools/builderTools");
  const rel: any = { type: "predation", prey: "hagfish", predator: "shark" };
  const params: Record<string, number> = {};
  const meta: Record<string, any> = {};
  addRelationParams(rel, params, meta, { hagfish: "盲鳗", shark: "睡鲨" }, [], []);
  const ok = rel.predatorDeathRate === "shark_m" && params.shark_m !== undefined;
  if (ok) { pass++; console.log("PASS 顶级捕食者 predatorDeathRate 写回 relation"); }
  else { fail++; process.exitCode = 1; console.log(`FAIL rel.predatorDeathRate=${rel.predatorDeathRate} params.shark_m=${params.shark_m}`); }
  // 验证崩溃链：盲鳗灭绝后睡鲨应饿死（有死亡项）
  const { derivatives } = await import("../src/eco/derivatives");
  const spec: any = { species: [
    { id: "hagfish", minValue: 0.5, hasLogistic: false },
    { id: "shark", minValue: 0.5, hasLogistic: false },
  ], relations: [rel] };
  const d = derivatives(spec, params, { hagfish: 0.5, shark: 100 });
  if (d.shark < 0) { pass++; console.log(`  PASS 睡鲨在盲鳗灭绝后导数=${d.shark.toFixed(2)}（饿死）`); }
  else { fail++; process.exitCode = 1; console.log(`  FAIL 睡鲨导数=${d.shark}（未饿死）`); }
}

// 场景14: 对称竞争检测（护栏2——曲线"糊在一起"）+ 默认不对称竞争（护栏1）
//   旧行为：addRelationParams 默认 coeff1=coeff2=0.005（对称竞争），两条曲线
//   完全重合无区分度，现实中几乎不存在且无教学价值。
//   修复：a) 默认竞争系数不对称（0.012 / 0.005，一方约 2.4 倍强）；
//        b) detectCurveOverlap 检测稳定期曲线重合，结果透传给 LLM 判断是否修改。
{
  const { detectCurveOverlap } = await import("../src/tools/feasibility");
  const { addRelationParams } = await import("../src/tools/builderTools");
  // a) 默认不对称竞争：addRelationParams 未传 coeff 时生成不对称系数
  const rel: any = { type: "competition", species1: "big", species2: "small" };
  const params: Record<string, number> = {};
  const meta: Record<string, any> = {};
  addRelationParams(rel, params, meta, { big: "大草履虫", small: "小草履虫" }, [], []);
  const asymmetric = params.big_small_c1 !== params.big_small_c2;
  if (asymmetric) { pass++; console.log(`PASS 默认竞争系数不对称 c1=${params.big_small_c1} c2=${params.big_small_c2}`); }
  else { fail++; process.exitCode = 1; console.log(`FAIL 默认对称竞争 c1=${params.big_small_c1} c2=${params.big_small_c2}`); }

  // b) detectCurveOverlap：对称竞争（coeff 相等）→ 检测到糊在一起
  const S = (id: string, hasLogistic: boolean): any => ({
    id, name: id, hasLogistic, initial: 50, minValue: 0.5,
    ...(hasLogistic ? { growthRate: `${id}_r`, carryingCapacity: `${id}_K` } : {}),
  });
  const symSpecies = [S("a", true), S("b", true)];
  const symRel: any = { type: "competition", species1: "a", species2: "b", coeff1: "a_b_c1", coeff2: "a_b_c2" };
  const symParams = { A0: 50, B0: 50, a_r: 0.3, a_K: 200, b_r: 0.3, b_K: 200, a_b_c1: 0.005, a_b_c2: 0.005 };
  const symOv = detectCurveOverlap(symSpecies, [symRel], symParams);
  if (symOv.length > 0) { pass++; console.log(`PASS 对称竞争检测到曲线糊在一起 ${JSON.stringify(symOv)}`); }
  else { fail++; process.exitCode = 1; console.log("FAIL 对称竞争未检测到糊在一起"); }

  // c) 不对称竞争 → 不应误检
  const asymParams = { A0: 50, B0: 50, a_r: 0.3, a_K: 200, b_r: 0.3, b_K: 200, a_b_c1: 0.015, a_b_c2: 0.001 };
  const asymOv = detectCurveOverlap(symSpecies, [symRel], asymParams);
  if (asymOv.length === 0) { pass++; console.log("PASS 不对称竞争未误检糊在一起"); }
  else { fail++; process.exitCode = 1; console.log(`FAIL 不对称竞争误检 ${JSON.stringify(asymOv)}`); }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(pass > 0 && fail === 0 ? 0 : 1);