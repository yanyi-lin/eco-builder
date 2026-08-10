import type { EcoModelSpec } from "../types";

/**
 * v1 默认模型：植物-雪兔-猞猁 Lotka-Volterra 三营养级。
 * 参数与原 index.html 完全一致，derivatives 输出等价于原方程。
 *
 * 原方程：
 *   dP = r·P·(1-P/K) - a·P·H
 *   dH = e·a·P·H - d·H - b·H·L
 *   dL = f·b·H·L - m·L
 *
 * 映射到通用 spec：
 *   plant:  hasLogistic(r, K)，作为 plant->hare 关系的 prey
 *   hare:   deathRate=d，既是 plant->hare 的 predator(转化 e)，
 *           又是 hare->lynx 的 prey
 *   lynx:   hare->lynx 的 predator(转化 f)，predatorDeathRate=m
 */
export const lotkaVolterra3: EcoModelSpec = {
  id: "lotkaVolterra3",
  name: "植物-雪兔-猞猁 (Lotka-Volterra)",
  description:
    "三营养级捕食系统：植物（资源）→ 雪兔（初级消费者）→ 猞猁（次级消费者），" +
    "呈现典型的时滞性周期振荡。基于高中生物学选择性必修2《生物与环境》。",
  species: [
    {
      id: "plant",
      name: "植物种群",
      icon: "/dicot_plant_icon.png",
      color: "#2e7d32",
      axis: "left",
      minValue: 1.2,
      initial: 150.0,
      hasLogistic: true,
      growthRate: "r",
      carryingCapacity: "K",
      maxCapacityRatio: 1.2,
    },
    {
      id: "hare",
      name: "雪兔种群",
      icon: "/snow_hare_icon.png",
      color: "#1e88e5",
      axis: "right",
      minValue: 0.5,
      initial: 42.0,
      hasLogistic: false,
      deathRate: "d",
    },
    {
      id: "lynx",
      name: "猞猁种群",
      icon: "/lynx_icon.png",
      color: "#e53935",
      axis: "right",
      minValue: 0.2,
      initial: 8.0,
      hasLogistic: false,
    },
  ],
  relations: [
    {
      type: "predation",
      prey: "plant",
      predator: "hare",
      predationRate: "a",
      conversionEfficiency: "e",
    },
    {
      type: "predation",
      prey: "hare",
      predator: "lynx",
      predationRate: "b",
      conversionEfficiency: "f",
      predatorDeathRate: "m",
    },
  ],
  params: {
    r: 0.28,
    K: 280,
    a: 0.009,
    e: 0.68,
    d: 0.22,
    b: 0.016,
    f: 0.45,
    m: 0.1,
    dt: 0.045,
    Plant0: 150.0,
    Hare0: 42.0,
    Lynx0: 8.0,
  },
  paramMeta: {
    r: { label: "r (植物增长率)", group: "dynamic", min: 0.05, max: 0.8, step: 0.005, digits: 3 },
    K: { label: "K (植物容纳量)", group: "dynamic", min: 100, max: 500, step: 5, digits: 0 },
    a: { label: "a (雪兔摄食率)", group: "dynamic", min: 0.002, max: 0.03, step: 0.0005, digits: 4 },
    e: { label: "e (植物→雪兔转化)", group: "dynamic", min: 0.2, max: 1.0, step: 0.01, digits: 3 },
    d: { label: "d (雪兔死亡率)", group: "dynamic", min: 0.1, max: 0.5, step: 0.005, digits: 3 },
    b: { label: "b (猞猁捕食率)", group: "dynamic", min: 0.005, max: 0.04, step: 0.0005, digits: 4 },
    f: { label: "f (雪兔→猞猁转化)", group: "dynamic", min: 0.2, max: 0.9, step: 0.01, digits: 3 },
    m: { label: "m (猞猁死亡率)", group: "dynamic", min: 0.05, max: 0.3, step: 0.005, digits: 3 },
    dt: { label: "dt (积分步长)", group: "dynamic", min: 0.01, max: 0.1, step: 0.001, digits: 3 },
    Plant0: { label: "P₀ (植物初始)", group: "initial", min: 20, max: 250, step: 5, digits: 1, speciesId: "plant" },
    Hare0: { label: "H₀ (雪兔初始)", group: "initial", min: 5, max: 80, step: 2, digits: 1, speciesId: "hare" },
    Lynx0: { label: "L₀ (猞猁初始)", group: "initial", min: 1, max: 30, step: 1, digits: 1, speciesId: "lynx" },
  },
  dt: 0.045,
  axisRanges: {
    left: {
      min: 0,
      max: 350,
      step: 50,
      title: "植物种群密度",
      color: "#2e7d32",
    },
    right: {
      min: 0,
      max: 100,
      step: 20,
      title: "雪兔 / 猞猁 种群密度",
      color: "#1e88e5",
    },
  },
};
