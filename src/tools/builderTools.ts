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
      params[initKey] = 150;
      
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
      params[initKey] = 30;
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

/** 为关系添加参数 */
export function addRelationParams(
  relation: RelationDef,
  params: Record<string, number>,
  paramMeta: Record<string, ParamMeta>,
  speciesNames: Record<string, string>
): void {
  if (relation.type === "predation" && relation.predationRate && relation.conversionEfficiency) {
    params[relation.predationRate] = 0.01;
    params[relation.conversionEfficiency] = 0.6;
    
    const preyName = speciesNames[relation.prey!] || relation.prey;
    const predatorName = speciesNames[relation.predator!] || relation.predator;
    
    paramMeta[relation.predationRate] = {
      label: `${relation.predationRate} (${predatorName}捕食${preyName}率)`,
      group: "dynamic",
      min: 0.001,
      max: 0.05,
      step: 0.001,
      digits: 4,
    };
    paramMeta[relation.conversionEfficiency] = {
      label: `${relation.conversionEfficiency} (${preyName}→${predatorName}转化)`,
      group: "dynamic",
      min: 0.1,
      max: 0.9,
      step: 0.05,
      digits: 3,
    };
    
    if (relation.predatorDeathRate) {
      params[relation.predatorDeathRate] = 0.1;
      paramMeta[relation.predatorDeathRate] = {
        label: `${relation.predatorDeathRate} (${predatorName}死亡率)`,
        group: "dynamic",
        min: 0.05,
        max: 0.3,
        step: 0.01,
        digits: 3,
      };
    }
  } else if (relation.type === "competition" && relation.coeff1 && relation.coeff2) {
    params[relation.coeff1] = 0.005;
    params[relation.coeff2] = 0.005;
    
    const sp1Name = speciesNames[relation.species1!] || relation.species1;
    const sp2Name = speciesNames[relation.species2!] || relation.species2;
    
    paramMeta[relation.coeff1] = {
      label: `${relation.coeff1} (${sp1Name}竞争系数)`,
      group: "dynamic",
      min: 0.001,
      max: 0.02,
      step: 0.001,
      digits: 4,
    };
    paramMeta[relation.coeff2] = {
      label: `${relation.coeff2} (${sp2Name}竞争系数)`,
      group: "dynamic",
      min: 0.001,
      max: 0.02,
      step: 0.001,
      digits: 4,
    };
  } else if (relation.type === "mutualism" && relation.coeff1 && relation.coeff2) {
    params[relation.coeff1] = 0.003;
    params[relation.coeff2] = 0.003;
    
    const sp1Name = speciesNames[relation.species1!] || relation.species1;
    const sp2Name = speciesNames[relation.species2!] || relation.species2;
    
    paramMeta[relation.coeff1] = {
      label: `${relation.coeff1} (${sp1Name}互利系数)`,
      group: "dynamic",
      min: 0.001,
      max: 0.01,
      step: 0.001,
      digits: 4,
    };
    paramMeta[relation.coeff2] = {
      label: `${relation.coeff2} (${sp2Name}互利系数)`,
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
  
  return {
    id: `custom_${Date.now()}`,
    name,
    description,
    species,
    relations: state.relations,
    params: state.params,
    paramMeta: state.paramMeta,
    dt: state.params.dt || 0.045,
    axisRanges: {
      left: { min: 0, max: 350, step: 50, title: species[0]?.name || "种群密度", color: species[0]?.color || "#2e7d32" },
      right: { min: 0, max: 100, step: 20, title: "其他种群密度", color: "#1e88e5" },
    },
  };
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
      const species: SpeciesDef = {
        id: args.id as string,
        name: args.name as string,
        color: (args.color as string) ?? "#4caf50",
        axis: "right",
        minValue: 0.5,
        // 用 ?? 而非 ||，避免 initial=0 时被短路为 30
        initial: (args.initial as number) ?? 30,
        hasLogistic: (args.hasLogistic as boolean) ?? false,
        growthRate: args.growthRate as string | undefined,
        carryingCapacity: args.carryingCapacity as string | undefined,
        deathRate: args.deathRate as string | undefined,
      };
      api.addSpecies(species);
      return { success: true, speciesId: species.id };
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
