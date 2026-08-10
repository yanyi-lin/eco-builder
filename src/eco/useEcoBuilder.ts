import { useState, useCallback, useMemo, useRef } from "react";
import type { SpeciesDef, RelationDef, EcoModelSpec, ParamMeta } from "../eco/types";
import {
  type BuilderState,
  type BuilderApi,
  inferDefaultParams,
  addRelationParams,
} from "../tools/builderTools";

export interface UseEcoBuilder {
  state: BuilderState;
  api: BuilderApi;
  addSpecies: (species: SpeciesDef) => void;
  removeSpecies: (id: string) => void;
  addRelation: (relation: RelationDef) => void;
  removeRelation: (index: number) => void;
  reset: () => void;
  buildAndRun: (spec: EcoModelSpec) => void;
}

/**
 * 管理 eco-builder 的构建状态。
 * 提供物种、关系、参数的增删改查，以及最终构建模型的能力。
 */
export function useEcoBuilder(
  onBuildAndRun?: (spec: EcoModelSpec) => void
): UseEcoBuilder {
  const [species, setSpecies] = useState<SpeciesDef[]>([]);
  const [relations, setRelations] = useState<RelationDef[]>([]);
  const [params, setParams] = useState<Record<string, number>>({ dt: 0.045 });
  const [paramMeta, setParamMeta] = useState<Record<string, ParamMeta>>({
    dt: { label: "dt (积分步长)", group: "dynamic", min: 0.01, max: 0.1, step: 0.001, digits: 3 },
  });

  const stateRef = useRef({ species, relations, params, paramMeta });
  stateRef.current = { species, relations, params, paramMeta };

  // 修复：不在 setSpecies updater 内嵌套 setState，避免违反 React 纯函数原则
  const addSpecies = useCallback((newSpecies: SpeciesDef) => {
    setSpecies(prev => [...prev, newSpecies]);
    const { params: newParams, paramMeta: newMeta } = inferDefaultParams([newSpecies]);
    setParams(p => ({ ...p, ...newParams }));
    setParamMeta(m => ({ ...m, ...newMeta }));
  }, []);

  const removeSpecies = useCallback((id: string) => {
    setSpecies(prev => prev.filter(s => s.id !== id));
    setRelations(prev => prev.filter(r => 
      r.prey !== id && r.predator !== id && r.species1 !== id && r.species2 !== id
    ));
  }, []);

  // 修复：不在 setRelations updater 内嵌套 setState
  const addRelation = useCallback((relation: RelationDef) => {
    setRelations(prev => [...prev, relation]);
    
    const newParams = { ...stateRef.current.params };
    const newMeta = { ...stateRef.current.paramMeta };
    
    const speciesNames: Record<string, string> = {};
    for (const sp of stateRef.current.species) {
      speciesNames[sp.id] = sp.name;
    }
    
    addRelationParams(relation, newParams, newMeta, speciesNames);
    
    setParams(newParams);
    setParamMeta(newMeta);
  }, []);

  const removeRelation = useCallback((index: number) => {
    setRelations(prev => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setSpecies([]);
    setRelations([]);
    setParams({ dt: 0.045 });
    setParamMeta({
      dt: { label: "dt (积分步长)", group: "dynamic", min: 0.01, max: 0.1, step: 0.001, digits: 3 },
    });
  }, []);

  // 修复：buildAndRun 直接接收完整 spec，不再重新构建
  const buildAndRun = useCallback((spec: EcoModelSpec) => {
    if (onBuildAndRun) {
      onBuildAndRun(spec);
    }
  }, [onBuildAndRun]);

  const state: BuilderState = useMemo(() => ({
    species,
    relations,
    params,
    paramMeta,
  }), [species, relations, params, paramMeta]);

  const api: BuilderApi = useMemo(() => ({
    get state() {
      return stateRef.current;
    },
    setSpecies: (sp) => setSpecies(sp),
    addSpecies,
    removeSpecies,
    addRelation,
    removeRelation,
    setParams: (p) => setParams(p),
    buildAndRun: (spec) => {
      if (onBuildAndRun) onBuildAndRun(spec);
    },
  }), [addSpecies, removeSpecies, addRelation, removeRelation, onBuildAndRun]);

  return {
    state,
    api,
    addSpecies,
    removeSpecies,
    addRelation,
    removeRelation,
    reset,
    buildAndRun,
  };
}
