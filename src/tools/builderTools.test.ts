import { describe, it, expect, beforeEach } from 'vitest';
import { executeBuilderTool } from './builderTools';
import type { BuilderApi, BuilderState } from './builderTools';
import type { SpeciesDef, RelationDef } from '../eco/types';

// 创建测试用的 BuilderApi mock
function createMockApi(): BuilderApi {
  const state: BuilderState = {
    species: [],
    relations: [],
    params: {},
    paramMeta: {},
  };
  
  return {
    state,
    setSpecies: (species: SpeciesDef[]) => { state.species = species; },
    addSpecies: (species: SpeciesDef) => { state.species.push(species); },
    removeSpecies: (id: string) => { 
      state.species = state.species.filter(s => s.id !== id);
      state.relations = state.relations.filter(r => 
        r.prey !== id && r.predator !== id && r.species1 !== id && r.species2 !== id
      );
    },
    addRelation: (relation: RelationDef) => { state.relations.push(relation); },
    removeRelation: (index: number) => { state.relations.splice(index, 1); },
    setParams: (params: Record<string, number>) => { Object.assign(state.params, params); },
    buildAndRun: () => {},
  };
}

describe('executeBuilderTool', () => {
  let api: BuilderApi;

  beforeEach(() => {
    api = createMockApi();
    // 添加一个测试物种
    api.addSpecies({
      id: 'hare',
      name: '兔',
      hasLogistic: false,
      initial: 50,
      minValue: 0.01,
      color: '#000',
      axis: 'right',
    });
  });

  describe('add-relation', () => {
    it('should reject self-predation (prey === predator)', async () => {
      const result = await executeBuilderTool('add-relation', {
        type: 'predation',
        prey: 'hare',
        predator: 'hare',
        predationRate: 'a',
        conversionEfficiency: 'e',
      }, api);

      expect(result).toHaveProperty('error');
      expect((result as any).error).toContain('不允许自捕食');
      expect(api.state.relations).toHaveLength(0);
    });

    it('should allow valid predation between different species', async () => {
      api.addSpecies({
        id: 'lynx',
        name: '猞猁',
        hasLogistic: false,
        initial: 20,
        minValue: 0.01,
        color: '#000',
        axis: 'right',
      });

      const result = await executeBuilderTool('add-relation', {
        type: 'predation',
        prey: 'hare',
        predator: 'lynx',
        predationRate: 'a',
        conversionEfficiency: 'e',
      }, api);

      expect(result).toHaveProperty('success', true);
      expect(api.state.relations).toHaveLength(1);
      expect(api.state.relations[0].type).toBe('predation');
    });
  });
});
