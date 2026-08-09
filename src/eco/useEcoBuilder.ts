import { useState, useCallback, useMemo, useRef } from "react";
import type { SpeciesDef, RelationDef, EcoModelSpec, ParamMeta } from "../eco/types";
import {
  type BuilderState,
  type BuilderApi,
  inferDefaultParams,
  addRelationParams,
  buildModel,
} from "../tools/builderTools";

export interface UseEcoBuilder {
  state: BuilderState;
  api: BuilderApi;
  addSpecies: (species: SpeciesDef) => void;
  removeSpecies: (id: string) => void;
  addRelation: (relation: RelationDef) => void;
  removeRelation: (index: number) => void;
  reset: () => void;
  buildAndRun: (name: string, description: string) => EcoModelSpec | null;
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

  const addSpecies = useCallback((newSpecies: SpeciesDef) => {
    setSpecies(prev => {
      const updated = [...prev, newSpecies];
      
      // 推断新物种的参数
      const { params: newParams, paramMeta: newMeta } = inferDefaultParams([newSpecies]);
      
      setParams(p => ({ ...p, ...newParams }));
      setParamMeta(m => ({ ...m, ...newMeta }));
      
      return updated;
    });
  }, []);

  const removeSpecies = useCallback((id: string) => {
    setSpecies(prev => prev.filter(s => s.id !== id));
    setRelations(prev => prev.filter(r => 
      r.prey !== id && r.predator !== id && r.species1 !== id && r.species2 !== id
    ));
  }, []);

  const addRelation = useCallback((relation: RelationDef) => {
    setRelations(prev => {
      const updated = [...prev, relation];
      
      // 为新关系添加参数
      const newParams = { ...stateRef.current.params };
      const newMeta = { ...stateRef.current.paramMeta };
      
      const speciesNames: Record<string, string> = {};
      for (const sp of stateRef.current.species) {
        speciesNames[sp.id] = sp.name;
      }
      
      addRelationParams(relation, newParams, newMeta, speciesNames);
      
      setParams(newParams);
      setParamMeta(newMeta);
      
      return updated;
    });
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

  const buildAndRun = useCallback((name: string, description: string): EcoModelSpec | null => {
    const state: BuilderState = {
      species: stateRef.current.species,
      relations: stateRef.current.relations,
      params: stateRef.current.params,
      paramMeta: stateRef.current.paramMeta,
    };
    
    const spec = buildModel(state, name, description);
    if (spec && onBuildAndRun) {
      onBuildAndRun(spec);
    }
    return spec;
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
    setSpecies,
    addSpecies,
    removeSpecies,
    addRelation,
    removeRelation,
    setParams,
    buildAndRun: (name, description) => {
      const spec = buildModel(stateRef.current, name, description);
      if (spec && onBuildAndRun) {
        onBuildAndRun(spec);
      }
      return spec;
    },
  }), [addSpecies, removeSpecies, addRelation, removeRelation, buildAndRun, onBuildAndRun]);

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
