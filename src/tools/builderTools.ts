import type { SpeciesDef, RelationDef, RelationType, EcoModelSpec, ParamMeta } from "../eco/types";

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

/** 查询交互关系（GloBI） */
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
    
    const interactions: GlobiInteraction[] = data.data?.map((row: string[]) => ({
      sourceTaxonName: row[data.columns.indexOf("source_taxon_name")] || "",
      targetTaxonName: row[data.columns.indexOf("target_taxon_name")] || "",
      interactionType: row[data.columns.indexOf("interaction_type")] || "",
    })) || [];
    
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
      // 若未设置初始值，默认 150
      if (!(initKey in params)) params[initKey] = 150;
      
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
      if (!(initKey in params)) params[initKey] = 30;
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
    const predationRate = relation.predationRate ?? `${prey}_${predator}_a`;
    const conversionEfficiency = relation.conversionEfficiency ?? `${prey}_${predator}_e`;

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
    if (isTopPredator) {
      const predatorDeathRate = relation.predatorDeathRate ?? `${predator}_m`;
      params[predatorDeathRate] = params[predatorDeathRate] ?? 0.1;
      paramMeta[predatorDeathRate] = {
        label: `${predatorName}死亡率`,
        group: "dynamic",
        min: 0.05,
        max: 0.3,
        step: 0.01,
        digits: 3,
      };
    }
  } else if (relation.type === "competition") {
    const sp1 = relation.species1 ?? "sp1";
    const sp2 = relation.species2 ?? "sp2";
    // 自动生成竞争参数键：<sp1>_<sp2>_c1 / _c2
    const coeff1 = relation.coeff1 ?? `${sp1}_${sp2}_c1`;
    const coeff2 = relation.coeff2 ?? `${sp1}_${sp2}_c2`;

    params[coeff1] = params[coeff1] ?? 0.005;
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
    // 自动生成互利参数键：<sp1>_<sp2>_m1 / _m2
    const coeff1 = relation.coeff1 ?? `${sp1}_${sp2}_m1`;
    const coeff2 = relation.coeff2 ?? `${sp1}_${sp2}_m2`;

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
  
  // 分配 Y 轴：第一个物种 left，其他 right
  const species = state.species.map((sp, i) => ({
    ...sp,
    axis: (i === 0 ? "left" : "right") as "left" | "right",
  }));

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
  
  // 根据初始值/容纳量动态计算 Y 轴范围（避免自定义模型数值超出固定 0-350/0-100 范围）
  const leftMax = calcAxisMax(species[0], params, 1.5);
  const rightSpecies = species.slice(1);
  const rightMax = rightSpecies.length > 0
    ? Math.max(...rightSpecies.map((s) => calcAxisMax(s, params, 1.5)))
    : 100;
  
  return {
    id: `custom_${Date.now()}`,
    name,
    description,
    species,
    relations,
    params,
    paramMeta,
    dt: params.dt || 0.045,
    axisRanges: {
      left: { min: 0, max: leftMax, step: niceStep(leftMax), title: species[0]?.name || "种群密度", color: species[0]?.color || "#2e7d32" },
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
      const hasLogistic = (args.hasLogistic as boolean) ?? false;
      const hasDeathRate = args.deathRate !== undefined;
      // 自动生成唯一参数键（LLM 无需提供键名，避免冲突/缺失导致 NaN）
      const keys = autoSpeciesKeys(id, hasLogistic, hasDeathRate);
      // 自动分配颜色（按添加顺序，避免同色曲线重叠）
      const color =
        (args.color as string) ??
        SPECIES_COLORS[api.state.species.length % SPECIES_COLORS.length];
      const species: SpeciesDef = {
        id,
        name: args.name as string,
        color,
        axis: "right",
        minValue: 0.5,
        // 用 ?? 而非 ||，避免 initial=0 时被短路为 30
        initial: (args.initial as number) ?? 30,
        hasLogistic,
        growthRate: keys.growthRate,
        carryingCapacity: keys.carryingCapacity,
        deathRate: keys.deathRate,
      };
      api.addSpecies(species);
      // 若 LLM 提供了参数数值，覆盖默认值
      const overrides: Record<string, number> = {};
      if (hasLogistic && keys.growthRate && keys.carryingCapacity) {
        if (typeof args.growthRate === "number") overrides[keys.growthRate] = args.growthRate;
        if (typeof args.carryingCapacity === "number") overrides[keys.carryingCapacity] = args.carryingCapacity;
      }
      if (hasDeathRate && keys.deathRate && typeof args.deathRate === "number") {
        overrides[keys.deathRate] = args.deathRate;
      }
      if (Object.keys(overrides).length > 0) {
        api.setParams({ ...api.state.params, ...overrides });
      }
      return { success: true, speciesId: id };
    }
    
    case "add-relation": {
      // 运行时校验关系类型，避免非法值
      const relType = args.type as string;
      if (relType !== "predation" && relType !== "competition" && relType !== "mutualism") {
        return { error: `非法关系类型: ${relType ?? "undefined"}` };
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
    
    case "build-model":
      const model = buildModel(
        api.state,
        args.name as string || "自定义模型",
        args.description as string || ""
      );
      return model ? { success: true, modelId: model.id } : { error: "构建失败：没有物种" };
    
    case "run-model":
      const builtModel = buildModel(
        api.state,
        args.name as string || "自定义模型",
        args.description as string || ""
      );
      if (builtModel) {
        api.buildAndRun(builtModel);
        return { success: true, modelId: builtModel.id };
      }
      return { error: "构建失败：没有物种" };
    
    default:
      return { error: `未知工具: ${toolName}` };
  }
}
