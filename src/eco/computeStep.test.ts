import { describe, it, expect } from 'vitest';
import { computeStep } from './computeStep';
import type { RelationDef } from './types';
import { makeSpecies } from './test-utils';

describe('computeStep', () => {
  it('should compute logistic growth for single species', () => {
    const species = [makeSpecies({
      id: 'plant',
      name: '草',
      hasLogistic: true,
      growthRate: 'plant_r',
      carryingCapacity: 'plant_K',
      initial: 100,
      minValue: 0.01,
    })];
    const relations: RelationDef[] = [];
    const params = { plant_r: 0.5, plant_K: 1000 };
    const pops = { plant: 100 };
    const dt = 0.1;

    const next = computeStep(species, relations, params, pops, dt);

    // logistic: dN/dt = r*N*(1-N/K) = 0.5*100*(1-100/1000) = 45
    // next = 100 + 45*0.1 = 104.5
    expect(next.plant).toBeCloseTo(104.5, 5);
  });

  it('should compute predation correctly', () => {
    const species = [
      makeSpecies({ id: 'prey', name: '兔', hasLogistic: true, growthRate: 'prey_r', carryingCapacity: 'prey_K', initial: 100, minValue: 0.01 }),
      makeSpecies({ id: 'pred', name: '狼', hasLogistic: false, initial: 20, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [{
      type: 'predation',
      prey: 'prey',
      predator: 'pred',
      predationRate: 'a',
      conversionEfficiency: 'e',
      predatorDeathRate: 'pred_d',
    }];
    const params = { prey_r: 0.5, prey_K: 1000, a: 0.01, e: 0.1, pred_d: 0.1 };
    const pops = { prey: 100, pred: 20 };
    const dt = 0.1;

    const next = computeStep(species, relations, params, pops, dt);

    // prey: logistic - predation = 0.5*100*0.9 - 0.01*100*20 = 45 - 20 = 25
    // next.prey = 100 + 25*0.1 = 102.5
    expect(next.prey).toBeCloseTo(102.5, 5);
    
    // pred: predatorDeathRate only (no deathRate in SpeciesDef)
    // conversion - death = 0.1*0.01*100*20 - 0.1*20 = 2 - 2 = 0
    // next.pred = 20 + 0*0.1 = 20
    expect(next.pred).toBeCloseTo(20, 5);
  });

  it('should compute competition correctly', () => {
    const species = [
      makeSpecies({ id: 'sp1', name: '物种1', hasLogistic: true, growthRate: 'r1', carryingCapacity: 'K1', initial: 50, minValue: 0.01 }),
      makeSpecies({ id: 'sp2', name: '物种2', hasLogistic: true, growthRate: 'r2', carryingCapacity: 'K2', initial: 50, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [{
      type: 'competition',
      species1: 'sp1',
      species2: 'sp2',
      coeff1: 'alpha1',
      coeff2: 'alpha2',
    }];
    const params = { r1: 0.3, K1: 500, r2: 0.3, K2: 500, alpha1: 0.002, alpha2: 0.002 };
    const pops = { sp1: 50, sp2: 50 };
    const dt = 0.1;

    const next = computeStep(species, relations, params, pops, dt);

    // sp1: logistic - competition = 0.3*50*(1-50/500) - 0.002*50*50 = 13.5 - 5 = 8.5
    // next.sp1 = 50 + 8.5*0.1 = 50.85
    expect(next.sp1).toBeCloseTo(50.85, 5);
    expect(next.sp2).toBeCloseTo(50.85, 5);
  });

  it('should compute mutualism with saturation (Holling Type II)', () => {
    const species = [
      makeSpecies({ id: 'sp1', name: '物种1', hasLogistic: true, growthRate: 'r1', carryingCapacity: 'K1', initial: 100, minValue: 0.01 }),
      makeSpecies({ id: 'sp2', name: '物种2', hasLogistic: true, growthRate: 'r2', carryingCapacity: 'K2', initial: 100, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [{
      type: 'mutualism',
      species1: 'sp1',
      species2: 'sp2',
      coeff1: 'beta1',
      coeff2: 'beta2',
    }];
    const params = { r1: 0.3, K1: 200, r2: 0.3, K2: 200, beta1: 0.05, beta2: 0.05 };
    const pops = { sp1: 100, sp2: 100 };
    const dt = 0.1;

    const next = computeStep(species, relations, params, pops, dt);

    // h = 1/(K1*K2) = 1/40000 = 0.000025
    // raw = 100*100 = 10000
    // interaction = 10000 / (1 + 0.000025*10000) = 10000 / 1.25 = 8000
    // sp1: logistic + mutualism = 0.3*100*0.5 + 0.05*8000 = 15 + 400 = 415
    // next.sp1 = 100 + 415*0.1 = 141.5
    expect(next.sp1).toBeCloseTo(141.5, 4);
    expect(next.sp2).toBeCloseTo(141.5, 4);
  });

  it('should clamp population to minValue', () => {
    const species = [makeSpecies({
      id: 'sp', name: '物种', hasLogistic: false, deathRate: 'd', initial: 1, minValue: 0.01,
    })];
    const relations: RelationDef[] = [];
    const params = { d: 100 }; // 极高死亡率
    const pops = { sp: 1 };
    const dt = 0.1;

    const next = computeStep(species, relations, params, pops, dt);

    // dN/dt = -100*1 = -100, next = 1 + (-100)*0.1 = -9, clamped to minValue
    expect(next.sp).toBe(0.01);
  });

  it('should handle NaN/Infinity gracefully', () => {
    const species = [makeSpecies({
      id: 'sp', name: '物种', hasLogistic: true, growthRate: 'r', carryingCapacity: 'K', initial: 100, minValue: 0.01,
    })];
    const relations: RelationDef[] = [];
    const params = { r: Infinity, K: 1000 }; // 极端参数
    const pops = { sp: 100 };
    const dt = 0.1;

    const next = computeStep(species, relations, params, pops, dt);

    // Should fallback to minValue when result is not finite
    expect(next.sp).toBe(0.01);
  });
});
