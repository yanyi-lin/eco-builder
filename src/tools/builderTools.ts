import type { SpeciesDef, RelationDef, RelationType, EcoModelSpec, ParamMeta } from "../eco/types";
import { ensureFeasible, detectCurveOverlap } from "./feasibility";

/** GBIF 物种匹配结果 */
export interface GbifMatch {
  usageKey: number;
  scientificName: string;
  canonicalName: string;
  rank: string;
  status: string;
  confidence: number;
  matchType: string;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  species: string;
}

/** GloBI 交互记录 */
export interface GlobiInteraction {
  sourceTaxonName: string;
  targetTaxonName: string;
  interactionType: string;
}

/** Builder 状态 */
export interface BuilderState {
  species: SpeciesDef[];
  relations: RelationDef[];
  params: Record<string, number>;
  paramMeta: Record<string, ParamMeta>;
}

/** 模块级缓存：避免 build-model + run-model 重复计算 buildModel（含 ensureFeasible） */
let _buildCache: { key: string; model: EcoModelSpec } | null = null;

/** 生成缓存 key（基于物种+关系+参数的哈希） */
function buildCacheKey(state: BuilderState, name?: string, description?: string): string {
  return JSON.stringify({
    species: state.species.map(s => s.id),
    relations: state.relations.map(r => `${r.type}-${r.prey ?? r.species1}-${r.predator ?? r.species2}`),
    params: state.params,
    name,
    description,
  });
}

/**
 * 构建或复用模型（带缓存）。
 * 关键：即使缓存命中，也**必须重新生成 model.id**（uuid）。
 * 若复用相同 id，React 侧依赖 [spec.id] 的 effect（useEcoSimulation/useEcoChart）
 * 不会触发 spec 切换重置，导致"新模型参数未生效/仍显示旧模型"。
 */
function buildModelCached(
  state: BuilderState,
  name?: string,
  description?: string,
): EcoModelSpec | null {
  const cacheKey = buildCacheKey(state, name, description);
  let model: EcoModelSpec | null = null;
  if (_buildCache?.key === cacheKey) {
    model = _buildCache.model;
  } else {
    model = buildModel(state, name || "自定义模型", description || "");
    if (model) _buildCache = { key: cacheKey, model };
  }
  if (!model) return null;
  // 每次调用重新生成唯一 id（缓存只复用数值计算，不复用 id）
  return { ...model, id: `custom_${crypto.randomUUID?.() ?? Date.now().toString(36)}` };
}

/** Builder API */
export interface BuilderApi {
  state: BuilderState;
  setSpecies: (species: SpeciesDef[]) => void;
  addSpecies: (species: SpeciesDef) => void;
  removeSpecies: (id: string) => void;
  addRelation: (relation: RelationDef) => void;
  removeRelation: (index: number) => void;
  setParams: (params: Record<string, number>) => void;
  buildAndRun: (spec: EcoModelSpec) => void;
}

/** 自动生成的物种参数键（避免 LLM 提供键名导致冲突/缺失 → NaN） */
export interface AutoKeys {
  growthRate?: string;
  carryingCapacity?: string;
  deathRate?: string;
}

/** 物种调色板（按添加顺序分配，避免同色曲线重叠看似一条） */
const SPECIES_COLORS = [
  "#4caf50", "#1e88e5", "#e53935", "#fb8c00",
  "#8e24aa", "#00897b", "#5e35b1", "#c0ca33",
];

/** 生成物种唯一参数键：<id>_r / <id>_K / <id>_d */
export function autoSpeciesKeys(
  id: string,
  hasLogistic: boolean,
  hasDeathRate: boolean,
): AutoKeys {
  return {
    growthRate: hasLogistic ? `${id}_r` : undefined,
    carryingCapacity: hasLogistic ? `${id}_K` : undefined,
    deathRate: hasDeathRate ? `${id}_d` : undefined,
  };
}

/** 数值 clamp 到 [min, max]，防御 LLM 传极端参数导致系统崩溃 */
function clampNum(v: number, min: number, max: number): number {
  if (!isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
}

/** 搜索物种（GBIF） */
export async function searchSpecies(query: string): Promise<{
  matches: GbifMatch[];
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(query)}`
    );
    if (!response.ok) {
      return { matches: [], error: `GBIF API error: ${response.status}` };
    }
    const data = await response.json();
    
    // 检查匹配结果
    if (data.matchType === "NONE") {
      return { 
        matches: [], 
        error: `GBIF 未找到 "${query}"。GBIF 不支持中文名，请提供拉丁学名（如 "Vulpes vulpes"）` 
      };
    }
    
    return { matches: [data] };
  } catch (err) {
    return { matches: [], error: `请求失败: ${err}` };
  }
}

/** 查询交互关系（GloBI）。只返回涉及查询两物种的记录，过滤第三方物种，
 *  避免把 GloBI 返回的其他物种（如狼的其他猎物）呈献给 agent 导致其主动扩种。 */
export async function queryInteractions(
  species1: string,
  species2: string
): Promise<{
  interactions: GlobiInteraction[];
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://api.globalbioticinteractions.org/interaction?sourceTaxon=${encodeURIComponent(species1)}&targetTaxon=${encodeURIComponent(species2)}&limit=20`
    );
    if (!response.ok) {
      return { interactions: [], error: `GloBI API error: ${response.status}` };
    }
    const data = await response.json();
    
    const allInteractions: GlobiInteraction[] = data.data?.map((row: string[]) => ({
      sourceTaxonName: row[data.columns.indexOf("source_taxon_name")] || "",
      targetTaxonName: row[data.columns.indexOf("target_taxon_name")] || "",
      interactionType: row[data.columns.indexOf("interaction_type")] || "",
    })) || [];
    
    // 关键过滤：仅保留 source/target 都是查询两物种的记录，
    // 排除 GloBI 返回中涉及第三方物种（如狼的其他猎物、其他捕食者）的记录。
    const a = species1.toLowerCase();
    const b = species2.toLowerCase();
    const interactions = allInteractions.filter((it) => {
      const s = it.sourceTaxonName.toLowerCase();
      const t = it.targetTaxonName.toLowerCase();
      // 两端任一与查询物种匹配即可（GloBI 字段方向可能是 source=猎物/target=捕食者）
      const sIsAB = s.includes(a) || s.includes(b);
      const tIsAB = t.includes(a) || t.includes(b);
      // 必须一端是查询物种 A、另一端是查询物种 B（允许字段方向互换）
      return (sIsAB && tIsAB);
    });
    
    return { interactions };
  } catch (err) {
    return { interactions: [], error: `请求失败: ${err}` };
  }
}

/** 根据分类学推断默认参数 */
export function inferDefaultParams(species: SpeciesDef[]): {
  params: Record<string, number>;
  paramMeta: Record<string, ParamMeta>;
} {
  const params: Record<string, number> = {};
  const paramMeta: Record<string, ParamMeta> = {};
  
  for (const sp of species) {
    const initKey = `${sp.id.charAt(0).toUpperCase()}${sp.id.slice(1)}0`;
    
    if (sp.hasLogistic && sp.growthRate && sp.carryingCapacity) {
      params[sp.growthRate] = 0.3;
      params[sp.carryingCapacity] = 200;
      // 初始值：优先使用 LLM 传入的 sp.initial（add-species 时用户指定），
      // 仅在未提供时才用默认值。历史 bug：这里强制写 150/30 覆盖了用户意图
      // （如鹿=100 被改成 30），且 buildModel 的兜底（params[initKey]===undefined）
      // 因已写入而永不触发。
      if (!(initKey in params)) params[initKey] = sp.initial ?? 150;
      
      paramMeta[sp.growthRate] = {
        label: `${sp.growthRate} (${sp.name}增长率)`,
        group: "dynamic",
        min: 0.05,
        max: 0.8,
        step: 0.005,
        digits: 3,
      };
      paramMeta[sp.carryingCapacity] = {
        label: `${sp.carryingCapacity} (${sp.name}容纳量)`,
        group: "dynamic",
        min: 50,
        max: 500,
        step: 10,
        digits: 0,
      };
      paramMeta[initKey] = {
        label: `${initKey} (${sp.name}初始)`,
        group: "initial",
        min: 10,
        max: 300,
        step: 10,
        digits: 0,
        speciesId: sp.id,
      };
    }
    
    if (sp.deathRate) {
      params[sp.deathRate] = 0.15;
      paramMeta[sp.deathRate] = {
        label: `${sp.deathRate} (${sp.name}死亡率)`,
        group: "dynamic",
        min: 0.05,
        max: 0.5,
        step: 0.01,
        digits: 3,
      };
    }
    
    if (!sp.hasLogistic && !sp.deathRate) {
      // 同上：优先 LLM 传入的 sp.initial，避免覆盖用户指定初始值
      if (!(initKey in params)) params[initKey] = sp.initial ?? 30;
      paramMeta[initKey] = {
        label: `${initKey} (${sp.name}初始)`,
        group: "initial",
        min: 5,
        max: 100,
        step: 5,
        digits: 0,
        speciesId: sp.id,
      };
    }
  }
  
  params.dt = 0.045;
  paramMeta.dt = {
    label: "dt (积分步长)",
    group: "dynamic",
    min: 0.01,
    max: 0.1,
    step: 0.001,
    digits: 3,
  };
  
  return { params, paramMeta };
}

/** 为关系添加参数（自动生成唯一参数键，避免 LLM 传键名冲突） */
export function addRelationParams(
  relation: RelationDef,
  params: Record<string, number>,
  paramMeta: Record<string, ParamMeta>,
  speciesNames: Record<string, string>,
  existingRelations?: RelationDef[],
  species?: SpeciesDef[],
): void {
  if (relation.type === "predation") {
    const prey = relation.prey ?? "prey";
    const predator = relation.predator ?? "predator";
    // 自动生成捕食参数键：<prey>_<pred>_a / _e / _m
    // 关键：把生成的键写回 relation 对象（derivatives 读 params[rel.predationRate]，
    // 若 relation.predationRate 为 undefined 则捕食项恒为 0 → 消费者只剩衰减 → 灭绝）
    const predationRate = relation.predationRate ?? `${prey}_${predator}_a`;
    const conversionEfficiency = relation.conversionEfficiency ?? `${prey}_${predator}_e`;
    relation.predationRate = predationRate;
    relation.conversionEfficiency = conversionEfficiency;

    // 捕食率 clamp 到安全范围（敏感性分析：a>=0.018 时猎物在 ~136 步内灭绝，
    // 0.015 留安全裕度）。默认 0.01，与经典 LV 模型量级一致。
    // 若猎物是资源型（hasLogistic，如植物），捕食率取更低值 0.008，
    // 防止资源被过度消耗导致整个系统崩溃（原版植物捕食率仅 0.009）。
    const preyIsResource = species?.some((s) => s.id === prey && s.hasLogistic) ?? false;
    const defaultRate = preyIsResource ? 0.008 : 0.01;
    params[predationRate] = clampNum(params[predationRate] ?? defaultRate, 0.002, 0.015);
    // 转化效率默认 0.68（原版植物→雪兔参数，稳定性好；0.6 偏低易导致灭绝）
    params[conversionEfficiency] = clampNum(params[conversionEfficiency] ?? 0.68, 0.1, 0.9);

    const preyName = speciesNames[prey] || prey;
    const predatorName = speciesNames[predator] || predator;

    paramMeta[predationRate] = {
      label: `${predatorName}捕食${preyName}率`,
      group: "dynamic",
      min: 0.002,
      max: 0.015,
      step: 0.001,
      digits: 4,
    };
    paramMeta[conversionEfficiency] = {
      label: `${preyName}→${predatorName}转化`,
      group: "dynamic",
      min: 0.1,
      max: 0.9,
      step: 0.05,
      digits: 3,
    };

    // 捕食者死亡率只对"顶级捕食者"生成（该捕食者不再被任何其他关系捕食）。
    // 中间营养级物种（如兔子，既捕食草又被狼捕食）不生成 predatorDeathRate，
    // 否则与自身 deathRate 叠加 + 额外死亡项，导致数量偏低或灭绝。
    const isTopPredator = !(existingRelations ?? []).some(
      (r) => r.type === "predation" && r.prey === predator,
    );
    // 若顶级捕食者已有自身 deathRate（LLM 传入 <id>_d），则不生成 predatorDeathRate，
    // 避免双重死亡叠加导致灭绝。
    const hasSelfDeath = (species ?? []).some(
      (s) => s.id === predator && s.deathRate && params[s.deathRate] !== undefined,
    );
    if (isTopPredator && !hasSelfDeath) {
      const predatorDeathRate = relation.predatorDeathRate ?? `${predator}_m`;
      // 关键：把生成的键写回 relation 对象（computeStep 读 rel.predatorDeathRate，
      // 若 undefined 则顶级捕食者无额外死亡项 → 食物耗尽后仍不饿死 → 崩溃链不完整）
      relation.predatorDeathRate = predatorDeathRate;
      // 顶级捕食者死亡率 clamp 到 [0.03, 0.12]（敏感性分析：>0.12 时多次扰动下狼灭绝）
      params[predatorDeathRate] = clampNum(params[predatorDeathRate] ?? 0.08, 0.03, 0.12);
      paramMeta[predatorDeathRate] = {
        label: `${predatorName}死亡率`,
        group: "dynamic",
        min: 0.03,
        max: 0.12,
        step: 0.01,
        digits: 3,
      };
    }
  } else if (relation.type === "competition") {
    const sp1 = relation.species1 ?? "sp1";
    const sp2 = relation.species2 ?? "sp2";
    // 自动生成竞争参数键：<sp1>_<sp2>_c1 / _c2（写回 relation，derivatives 依赖）
    const coeff1 = relation.coeff1 ?? `${sp1}_${sp2}_c1`;
    const coeff2 = relation.coeff2 ?? `${sp1}_${sp2}_c2`;
    relation.coeff1 = coeff1;
    relation.coeff2 = coeff2;

    // 默认竞争系数**不对称**（生态学现实：几乎不存在势均力敌的对称竞争，
    // 总有一方对资源的竞争能力更强——如 Gause 实验中大小草履虫）。
    // 对称竞争（coeff1 == coeff2）会使两条曲线完全重合，失去教学价值。
    // 仅当 LLM 显式传入相同值时才保留对称（用户有意演示理想化对称场景）。
    // 强方默认 0.012（约 2.4 倍于弱方 0.005），体现明显的竞争强弱差异。
    params[coeff1] = params[coeff1] ?? 0.012;
    params[coeff2] = params[coeff2] ?? 0.005;

    const sp1Name = speciesNames[sp1] || sp1;
    const sp2Name = speciesNames[sp2] || sp2;

    paramMeta[coeff1] = {
      label: `${sp1Name}竞争系数`,
      group: "dynamic",
      min: 0.001,
      max: 0.02,
      step: 0.001,
      digits: 4,
    };
    paramMeta[coeff2] = {
      label: `${sp2Name}竞争系数`,
      group: "dynamic",
      min: 0.001,
      max: 0.02,
      step: 0.001,
      digits: 4,
    };
  } else if (relation.type === "mutualism") {
    const sp1 = relation.species1 ?? "sp1";
    const sp2 = relation.species2 ?? "sp2";
    // 自动生成互利参数键：<sp1>_<sp2>_m1 / _m2（写回 relation，derivatives 依赖）
    const coeff1 = relation.coeff1 ?? `${sp1}_${sp2}_m1`;
    const coeff2 = relation.coeff2 ?? `${sp1}_${sp2}_m2`;
    relation.coeff1 = coeff1;
    relation.coeff2 = coeff2;

    params[coeff1] = params[coeff1] ?? 0.003;
    params[coeff2] = params[coeff2] ?? 0.003;

    const sp1Name = speciesNames[sp1] || sp1;
    const sp2Name = speciesNames[sp2] || sp2;

    paramMeta[coeff1] = {
      label: `${sp1Name}互利系数`,
      group: "dynamic",
      min: 0.001,
      max: 0.01,
      step: 0.001,
      digits: 4,
    };
    paramMeta[coeff2] = {
      label: `${sp2Name}互利系数`,
      group: "dynamic",
      min: 0.001,
      max: 0.01,
      step: 0.001,
      digits: 4,
    };
  }
}

/** 构建模型 */
export function buildModel(
  state: BuilderState,
  name: string,
  description: string
): EcoModelSpec | null {
  if (state.species.length === 0) {
    return null;
  }
  
  const speciesNames: Record<string, string> = {};
  for (const sp of state.species) {
    speciesNames[sp.id] = sp.name;
  }

  // === 最终防护（第一性原理：保证自定义模型可运行、不快速灭绝）===
  // 1. 关系去重：同一 prey-predator 捕食关系只保留一条（重复会叠加捕食强度 → 猎物灭绝）
  const seenRel = new Set<string>();
  const relations = state.relations.filter((r) => {
    const key =
      r.type === "predation"
        ? `${r.type}:${r.prey}:${r.predator}`
        : `${r.type}:${r.species1}:${r.species2}`;
    if (seenRel.has(key)) return false;
    seenRel.add(key);
    return true;
  });

  // 2. 找出被猎食的物种（中间营养级），移除其捕食者死亡参数键 <id>_m
  //    （中间物种被更高层捕食，不该再有 predatorDeathRate 额外死亡项）
  const preyIds = new Set(relations.filter(r => r.type === "predation").map(r => r.prey ?? ""));
  const params = { ...state.params };
  const paramMeta = { ...state.paramMeta };
  for (const r of relations) {
    if (r.type === "predation" && r.predator) {
      if (preyIds.has(r.predator)) {
        // 中间营养级：移除多余死亡参数键
        const deathKey = `${r.predator}_m`;
        delete params[deathKey];
        delete paramMeta[deathKey];
      } else if (r.predationRate && params[r.predationRate] !== undefined) {
        // 顶级捕食者的捕食率也 clamp（防御 LLM 传极端值）
        params[r.predationRate] = clampNum(params[r.predationRate], 0.002, 0.015);
      }
    }
  }

  // 2b. 物种自身死亡率 clamp（LLM 可能传 0.5 等极端值 → 快速灭绝）
  //     差异化：顶级捕食者（不被捕食）容忍度低（上界 0.12），
  //     中间营养级（被捕食）容忍度高（上界 0.2）。
  //     敏感性分析：多次扰动下狼(顶级)死亡 >0.13 灭绝，0.12 留裕度。
  const topPredatorIds = new Set(
    relations
      .filter((r) => r.type === "predation" && !preyIds.has(r.predator ?? ""))
      .map((r) => r.predator ?? ""),
  );
  for (const sp of state.species) {
    if (sp.deathRate && params[sp.deathRate] !== undefined) {
      const upper = topPredatorIds.has(sp.id) ? 0.12 : 0.2;
      params[sp.deathRate] = clampNum(params[sp.deathRate], 0.02, upper);
    }
  }

  // 3. 增长来源兜底：无 logistic 且不是任何捕食关系"捕食者"的物种
  //    （既不自增长、也无食物来源）必然灭绝。自动补上 logistic 增长
  //    （生产者角色），不依赖 LLM 是否传 hasLogistic。
  const predatorIds = new Set(
    relations.filter(r => r.type === "predation").map(r => r.predator ?? ""),
  );

  // 重新构造 species：仅对"完全孤立"的物种兜底补 logistic。
  // 注意：参与 competition/mutualism 关系的物种不兜底——竞争场景下
  // "无自增长"正是"有限资源耗竭"的语义（如 Gause 竞争实验：大小草履虫
  // 竞争培养液，资源耗尽后双方都归零）。尊重 LLM 传入的 hasLogistic，
  // 不把竞争/互利物种强制改成生产者。
  const relationSpecies = new Set<string>();
  for (const r of relations) {
    if (r.type === "predation") {
      if (r.prey) relationSpecies.add(r.prey);
      if (r.predator) relationSpecies.add(r.predator);
    } else {
      if (r.species1) relationSpecies.add(r.species1);
      if (r.species2) relationSpecies.add(r.species2);
    }
  }
  const enrichedSpecies = state.species.map((sp) => {
    const hasFoodSource = predatorIds.has(sp.id);
    const inRelation = relationSpecies.has(sp.id);
    let out: SpeciesDef = { ...sp };
    // 仅当：无 logistic、无食物来源、且不参与任何关系（完全孤立）时才兜底补生产者
    if (!out.hasLogistic && !hasFoodSource && !inRelation) {
      // 无增长来源 → 视为生产者，补 logistic 增长
      const rKey = `${sp.id}_r`;
      const kKey = `${sp.id}_K`;
      out = {
        ...out,
        hasLogistic: true,
        growthRate: rKey,
        carryingCapacity: kKey,
      };
      // 补默认参数（若未设置）
      if (params[rKey] === undefined) params[rKey] = 0.3;
      if (params[kKey] === undefined) params[kKey] = 200;
      const initKey = `${sp.id.charAt(0).toUpperCase()}${sp.id.slice(1)}0`;
      if (params[initKey] === undefined) params[initKey] = sp.initial;
      // 补参数元数据
      if (paramMeta[rKey] === undefined) {
        paramMeta[rKey] = { label: `${sp.name}增长率`, group: "dynamic", min: 0.05, max: 0.8, step: 0.005, digits: 3 };
      }
      if (paramMeta[kKey] === undefined) {
        paramMeta[kKey] = { label: `${sp.name}容纳量`, group: "dynamic", min: 50, max: 500, step: 10, digits: 0 };
      }
    }
    return out;
  });

  // 分配 Y 轴：第一个 hasLogistic 的物种（生产者/自增长基底）占左轴，其余右轴。
  // 避免"先添加顶级捕食者"导致捕食者占左轴、语义与缩放错位（如森林中狼不应占左轴）。
  let leftIndex = enrichedSpecies.findIndex((s) => s.hasLogistic);
  if (leftIndex === -1) leftIndex = 0; // 无自增长物种时退化为第一个物种
  const speciesWithAxis = enrichedSpecies.map((sp, i) => ({
    ...sp,
    axis: (i === leftIndex ? "left" : "right") as "left" | "right",
  }));

  // === 数值可行性校验（硬保证：不因默认/LLM 参数灭绝）===
  // 快速模拟 ~4000 步（约 180 时间单位，覆盖 10+ 个振荡周期），
  // 若任一物种触底（≤ minValue）则进入"检测→修改→再检测"修复循环：
  // 参数性可修复（有能量来源但参数极端）→ 自动调参直到修好（adjusted）；
  // 结构性必然（如鲸落：无生产者/一次性资源，或调参仍无法避免）→ 不运行，返回诊断（structural-extinction）。
  const feasible = ensureFeasible(speciesWithAxis, relations, params);
  if (feasible.status === "adjusted") {
    console.warn("[builder] 模型参数不可行，已自动调整:", feasible.message);
  } else if (feasible.status === "structural-extinction") {
    console.warn("[builder] 结构性必然灭绝（不调参）:", feasible.message);
  }
  const finalParams = feasible.params;

  // 轴范围用修复后的参数计算（避免可行性调参改大 K/initial 后轴上限与真实种群不匹配、曲线顶到上沿）
  const leftMax = calcAxisMax(speciesWithAxis[leftIndex], finalParams, 1.5);
  const rightSpecies = speciesWithAxis.filter((_, i) => i !== leftIndex);
  const rightMax = rightSpecies.length > 0
    ? Math.max(...rightSpecies.map((s) => calcAxisMax(s, finalParams, 1.5)))
    : 100;

  // 竞争曲线"糊在一起"检测（对称竞争的典型症状）：检测结果透传给 LLM，
  // 由 LLM 判断是否需要修改（如使竞争系数不对称），而非代码强制修改——
  // 保持对教学场景的灵活性（用户可能有意演示对称竞争）。
  const curveOverlap = detectCurveOverlap(speciesWithAxis, relations, finalParams);

  return {
    id: `custom_${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
    name,
    description,
    species: speciesWithAxis,
    relations,
    params: finalParams,
    paramMeta,
    dt: params.dt || 0.045,
    feasibility: {
      status: feasible.status,
      message: feasible.message ?? "",
      ...(feasible.extinctSpecies ? { extinctSpecies: feasible.extinctSpecies } : {}),
      ...(curveOverlap.length > 0 ? { curveOverlap } : {}),
    },
    axisRanges: {
      left: { min: 0, max: leftMax, step: niceStep(leftMax), title: speciesWithAxis[leftIndex]?.name || "种群密度", color: speciesWithAxis[leftIndex]?.color || "#2e7d32" },
      right: { min: 0, max: rightMax, step: niceStep(rightMax), title: "其他种群密度", color: "#1e88e5" },
    },
  };
}

/** 计算单个物种的轴上限：取 initial 与 K（容纳量）的较大值，留出余量 */
function calcAxisMax(species: SpeciesDef, params: Record<string, number>, margin: number): number {
  let max = species.initial;
  if (species.carryingCapacity && params[species.carryingCapacity]) {
    max = Math.max(max, params[species.carryingCapacity]);
  }
  return Math.max(max * margin, 10);
}

/** 生成"好看的"刻度步长（1/2/5 × 10^n 系列） */
function niceStep(max: number): number {
  const raw = max / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  let step = pow;
  if (n >= 5) step = 5 * pow;
  else if (n >= 2) step = 2 * pow;
  return Math.max(step, 1);
}

/** 工具执行器 */
export async function executeBuilderTool(
  toolName: string,
  args: Record<string, unknown>,
  api: BuilderApi
): Promise<unknown> {
  switch (toolName) {
    case "search-species":
      return await searchSpecies(args.query as string);
    
    case "query-interactions":
      return await queryInteractions(
        args.species1 as string,
        args.species2 as string
      );
    
    case "add-species": {
      const id = args.id as string;
      // 数量上限：仅保留极端情况护栏（防止无限扩种拖垮图表/模拟），
      // 正常教学构建不限制（用户明确要求可加较多组分，好玩且不混乱）
      if (api.state.species.length >= 20) {
        return { error: `模型物种数已达上限（20），不能再添加 ${id}。如需更换物种请先说明并移除现有物种。` };
      }
      // id 校验：ASCII 小写字母开头，仅字母数字下划线（中文/混用大小写会导致关系引用断裂、initKey 碰撞）
      if (!/^[a-z][a-z0-9_]*$/.test(id ?? "")) {
        return { error: `物种 id "${id}" 非法：必须是小写英文开头（如 grass/rabbit/fox），仅含字母数字下划线` };
      }
      if (api.state.species.some((s) => s.id === id)) {
        return { error: `物种 "${id}" 已存在，请勿重复添加` };
      }
      // hasLogistic 严格布尔校验（LLM 传字符串 "false" 是 truthy，需拦截）
      const hasLogistic = args.hasLogistic === true;
      const hasDeathRate = args.deathRate !== undefined;
      // 自动生成唯一参数键（LLM 无需提供键名，避免冲突/缺失导致 NaN）
      const keys = autoSpeciesKeys(id, hasLogistic, hasDeathRate);
      // 自动分配颜色（按添加顺序，避免同色曲线重叠）
      const color =
        (args.color as string) ??
        SPECIES_COLORS[api.state.species.length % SPECIES_COLORS.length];
      // initial clamp 到 [1, 500]（LLM 可能传 10000/0 等极端值）
      const initial = clampNum(
        typeof args.initial === "number" ? args.initial : 30,
        1,
        500,
      );
      const species: SpeciesDef = {
        id,
        name: args.name as string,
        color,
        axis: "right",
        minValue: 0.5,
        initial,
        hasLogistic,
        growthRate: keys.growthRate,
        carryingCapacity: keys.carryingCapacity,
        deathRate: keys.deathRate,
      };
      api.addSpecies(species);
      // 若 LLM 提供了参数数值，覆盖默认值（但 clamp 到安全范围，防止极端值导致灭绝）
      const overrides: Record<string, number> = {};
      if (hasLogistic && keys.growthRate && keys.carryingCapacity) {
        if (typeof args.growthRate === "number") {
          overrides[keys.growthRate] = clampNum(args.growthRate, 0.05, 0.6);
        }
        if (typeof args.carryingCapacity === "number") {
          overrides[keys.carryingCapacity] = clampNum(args.carryingCapacity, 50, 500);
        }
      }
      if (hasDeathRate && keys.deathRate && typeof args.deathRate === "number") {
        overrides[keys.deathRate] = clampNum(args.deathRate, 0.02, 0.2);
      }
      if (Object.keys(overrides).length > 0) {
        api.setParams({ ...overrides });
      }
      return { success: true, speciesId: id };
    }
    
    case "add-relation": {
      // 运行时校验关系类型，避免非法值
      const relType = args.type as string;
      if (relType !== "predation" && relType !== "competition" && relType !== "mutualism") {
        return { error: `非法关系类型: ${relType ?? "undefined"}` };
      }
      const speciesIds = new Set(api.state.species.map((s) => s.id));
      if (relType === "predation") {
        // 捕食关系必须提供 prey+predator 且存在于已添加物种（缺失时关系静默失效 → 消费者灭绝）
        const prey = args.prey as string | undefined;
        const predator = args.predator as string | undefined;
        if (!prey || !predator) {
          return { error: "捕食关系必须同时提供 prey（被捕食者）和 predator（捕食者）字段，且 id 要与 add-species 一致" };
        }
        if (!speciesIds.has(prey)) return { error: `被捕食者 "${prey}" 不在已添加物种列表中，请先 add-species` };
        if (!speciesIds.has(predator)) return { error: `捕食者 "${predator}" 不在已添加物种列表中，请先 add-species` };
        // 阻止自捕食（prey === predator），数学上不会崩溃但语义荒谬
        if (prey === predator) {
          return { error: `不允许自捕食关系：prey 和 predator 不能是同一物种 "${prey}"` };
        }
      } else {
        const sp1 = args.species1 as string | undefined;
        const sp2 = args.species2 as string | undefined;
        if (!sp1 || !sp2) {
          return { error: "竞争/互利关系必须提供 species1 和 species2 字段" };
        }
        if (!speciesIds.has(sp1)) return { error: `物种 "${sp1}" 不在已添加物种列表中` };
        if (!speciesIds.has(sp2)) return { error: `物种 "${sp2}" 不在已添加物种列表中` };
      }
      const relation: RelationDef = {
        type: relType as RelationType,
        prey: args.prey as string | undefined,
        predator: args.predator as string | undefined,
        predationRate: args.predationRate as string | undefined,
        conversionEfficiency: args.conversionEfficiency as string | undefined,
        predatorDeathRate: args.predatorDeathRate as string | undefined,
        species1: args.species1 as string | undefined,
        species2: args.species2 as string | undefined,
        coeff1: args.coeff1 as string | undefined,
        coeff2: args.coeff2 as string | undefined,
      };
      api.addRelation(relation);
      return { success: true };
    }
    
    case "get-current-model":
      return {
        species: api.state.species.map(s => ({ id: s.id, name: s.name })),
        relations: api.state.relations.map(r => ({
          type: r.type,
          prey: r.prey,
          predator: r.predator,
          species1: r.species1,
          species2: r.species2,
        })),
        params: api.state.params,
      };
    
    case "build-model": {
      const model = buildModelCached(api.state, args.name as string, args.description as string);
      if (!model) return { error: "构建失败：没有物种" };
      return {
        success: true,
        modelId: model.id,
        feasibility: model.feasibility,
      };
    }

    case "run-model": {
      const builtModel = buildModelCached(api.state, args.name as string, args.description as string);
      if (!builtModel) return { error: "构建失败：没有物种" };
      // 结构性必然灭绝：**仍然运行模型**（教育价值——允许学生观察鲸落/生态瓶等
      // 不稳定系统如何慢慢崩溃，这正是教学场景）。不拦截，把可行性诊断透传给
      // LLM，由 LLM 向学生说明这是必然灭绝系统，值得观察崩溃过程。
      // 注：历史上曾拦截（"避免运行注定灭绝的模型"），但用户明确要求
      // 允许观察崩溃过程，故改为运行 + 标注。
      api.buildAndRun(builtModel);
      return {
        success: true,
        modelId: builtModel.id,
        feasibility: builtModel.feasibility,
      };
    }

    default:
      return { error: `未知工具: ${toolName}` };
  }
}
