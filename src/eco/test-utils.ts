import type { SpeciesDef } from './types';

/**
 * 测试辅助：创建 SpeciesDef（填充必填的 color/axis 字段）
 */
export function makeSpecies(overrides: Partial<SpeciesDef> & Pick<SpeciesDef, 'id' | 'name'>): SpeciesDef {
  return {
    color: '#000',
    axis: 'left',
    ...overrides,
  } as SpeciesDef;
}
