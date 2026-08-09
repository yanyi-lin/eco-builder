// ========================= 生态模型类型定义 =========================
// 通过 EcoModelSpec 描述任意物种 + 关系组合，derivatives 按 spec 动态生成。
// v1 内置 lotkaVolterra3（植物-雪兔-猞猁），未来加模型只需新增 spec 文件。

/** 参数滑块元数据（Eco-Tuner 用） */
export interface ParamMeta {
  /** 显示标签，如 "r (植物增长率)" */
  label: string;
  /** 分组：dynamic（动力学参数）/ initial（初始值） */
  group: "dynamic" | "initial";
  min: number;
  max: number;
  step: number;
  /** 显示小数位 */
  digits: number;
  /** 该参数对应的物种 id（仅 initial 组需要，用于重置时回填初始种群） */
  speciesId?: string;
}

/** Y 轴范围配置 */
export interface AxisRange {
  min: number;
  max: number;
  step: number;
  /** 轴标题 */
  title: string;
  /** 刻度颜色 */
  color: string;
}

/** 物种定义 */
export interface SpeciesDef {
  /** 物种 id，如 "plant" | "hare" | "lynx" */
  id: string;
  /** 显示名，如 "植物" */
  name: string;
  /** 图标文件名（可选，与 index.html 同目录） */
  icon?: string;
  /** 曲线颜色 */
  color: string;
  /** Y 轴归属 */
  axis: "left" | "right";
  /** 最小阈值（低于此值 clamp，防止数值不稳定） */
  minValue: number;
  /** 初始数量 */
  initial: number;
  /** 是否带 logistic 自限项 r·N·(1-N/K) */
  hasLogistic: boolean;
  /** 增长率参数键（hasLogistic=true 时必填），如 "r" */
  growthRate?: string;
  /** 环境容纳量参数键（hasLogistic=true 时必填），如 "K" */
  carryingCapacity?: string;
  /** 该物种的自然死亡率参数键（可选），如雪兔的 "d"。
   *  产生 -params[deathRate]·N 项。 */
  deathRate?: string;
  /** 数值上限倍数（相对 K，超过则 clamp）。仅 hasLogistic 物种生效。 */
  maxCapacityRatio?: number;
}

/** 关系类型 */
export type RelationType = "predation" | "competition" | "mutualism";

/** 关系定义 */
export interface RelationDef {
  type: RelationType;
  
  // === predation 专用 ===
  /** 被捕食者 speciesId */
  prey?: string;
  /** 捕食者 speciesId */
  predator?: string;
  /** 捕食率参数键，如 "a" / "b" */
  predationRate?: string;
  /** 转化效率参数键（捕食者从猎物获得的增长），如 "e" / "f" */
  conversionEfficiency?: string;
  /** 捕食者死亡率参数键（可选，顶级捕食者如猞猁的 "m"） */
  predatorDeathRate?: string;
  
  // === competition / mutualism 专用 ===
  /** 物种1 speciesId */
  species1?: string;
  /** 物种2 speciesId */
  species2?: string;
  /** 物种1受影响的参数键（competition: 竞争抑制系数；mutualism: 互利增益系数） */
  coeff1?: string;
  /** 物种2受影响的参数键 */
  coeff2?: string;
}

/** 完整模型规格 */
export interface EcoModelSpec {
  /** 模型 id，如 "lotkaVolterra3" */
  id: string;
  /** 显示名 */
  name: string;
  /** 简介（AI system prompt 与选择器 tooltip 用） */
  description: string;
  species: SpeciesDef[];
  relations: RelationDef[];
  /** 默认参数 */
  params: Record<string, number>;
  /** 参数滑块元数据 */
  paramMeta: Record<string, ParamMeta>;
  /** 积分步长 */
  dt: number;
  /** 双 Y 轴范围 */
  axisRanges: {
    left: AxisRange;
    right: AxisRange;
  };
}

/** 运行时参数（可被 Eco-Tuner 修改） */
export type EcoParams = Record<string, number>;

/** 种群数量快照：speciesId -> 数量 */
export type Populations = Record<string, number>;

/** 导数快照：speciesId -> dN/dt */
export type Derivatives = Record<string, number>;

/** read-animal-data 返回的物种条目 */
export interface SpeciesSnapshot {
  id: string;
  name: string;
  value: number;
  minValue: number;
  axis: "left" | "right";
}

/** read-animal-data 返回的关系摘要 */
export interface RelationSnapshot {
  type: RelationType;
  // predation
  prey?: string;
  predator?: string;
  // competition / mutualism
  species1?: string;
  species2?: string;
}

/** read-animal-data 完整快照 */
export interface EcoSnapshot {
  model: { id: string; name: string; description: string };
  species: SpeciesSnapshot[];
  relations: RelationSnapshot[];
  currentTime: number;
  simulationRunning: boolean;
  simulationActive: boolean;
}
