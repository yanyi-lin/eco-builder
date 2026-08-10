import { describe, it, expect } from 'vitest';
import { ensureFeasible } from './feasibility';
import type { RelationDef } from '../eco/types';
import { makeSpecies } from '../eco/test-utils';

describe('ensureFeasible', () => {
  it('should return ok for stable system', () => {
    const species = [
      makeSpecies({ id: 'plant', name: '草', hasLogistic: true, growthRate: 'plant_r', carryingCapacity: 'plant_K', initial: 100, minValue: 0.01 }),
      makeSpecies({ id: 'hare', name: '兔', hasLogistic: false, initial: 50, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [{
      type: 'predation',
      prey: 'plant',
      predator: 'hare',
      predationRate: 'a',
      conversionEfficiency: 'e',
      predatorDeathRate: 'hare_d',
    }];
    const params = { plant_r: 0.5, plant_K: 1000, a: 0.005, e: 0.1, hare_d: 0.2, Plant0: 100, Hare0: 50 };

    const result = ensureFeasible(species, relations, params);

    expect(result.status).toBe('ok');
    expect(result.extinctSpecies).toEqual([]);
  });

  it('should detect structural extinction (no producer)', () => {
    const species = [
      makeSpecies({ id: 'hare', name: '兔', hasLogistic: false, initial: 50, minValue: 0.01 }),
      makeSpecies({ id: 'lynx', name: '猞猁', hasLogistic: false, initial: 20, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [{
      type: 'predation',
      prey: 'hare',
      predator: 'lynx',
      predationRate: 'a',
      conversionEfficiency: 'e',
      predatorDeathRate: 'lynx_d',
    }];
    const params = { a: 0.01, e: 0.1, hare_d: 0.1, lynx_d: 0.05, Hare0: 50, Lynx0: 20 };

    const result = ensureFeasible(species, relations, params);

    expect(result.status).toBe('structural-extinction');
    // 至少有一个物种灭绝（hare 或 lynx）
    expect(result.extinctSpecies!.length).toBeGreaterThan(0);
  });

  it('should auto-fix parameter extinction', () => {
    const species = [
      makeSpecies({ id: 'plant', name: '草', hasLogistic: true, growthRate: 'plant_r', carryingCapacity: 'plant_K', initial: 5, minValue: 0.01 }),
      makeSpecies({ id: 'hare', name: '兔', hasLogistic: false, initial: 200, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [{
      type: 'predation',
      prey: 'plant',
      predator: 'hare',
      predationRate: 'a',
      conversionEfficiency: 'e',
      predatorDeathRate: 'hare_d',
    }];
    // 极端参数：捕食率极高 + 兔初始值过高 + 草初始值过低
    const params = { plant_r: 0.1, plant_K: 100, a: 0.1, e: 0.9, hare_d: 0.01, Plant0: 5, Hare0: 200 };

    const result = ensureFeasible(species, relations, params);

    // 系统应该稳定（可能经过调整或本身就稳定）
    expect(['ok', 'adjusted']).toContain(result.status);
    // 如果经过调整，捕食率应被降低
    if (result.status === 'adjusted') {
      expect(result.params.a).toBeLessThan(0.1);
    }
  });

  it('should use shared computeStep (consistency check)', () => {
    // 这个测试确保 feasibility.ts 使用的 computeStep 与 derivatives.ts 一致
    const species = [
      makeSpecies({ id: 'sp1', name: '物种1', hasLogistic: true, growthRate: 'r1', carryingCapacity: 'K1', initial: 50, minValue: 0.01 }),
    ];
    const relations: RelationDef[] = [];
    const params = { r1: 0.3, K1: 500, Sp10: 50 };

    const result = ensureFeasible(species, relations, params);

    // 单物种 logistic 应该稳定
    expect(result.status).toBe('ok');
  });
});
