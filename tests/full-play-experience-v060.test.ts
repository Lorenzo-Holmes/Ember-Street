import { describe, expect, it } from 'vitest';
import {
  SPECIALTY_LABEL,
  buildingConditionLabel,
  mealCoverageLine,
  nightPreparationLine,
} from '../src/V060AppHotfix';

describe('v0.6 full-play player-facing language', () => {
  it('maps implementation specialties to lived labels', () => {
    expect(SPECIALTY_LABEL.search).toBe('熟路');
    expect(SPECIALTY_LABEL.repair).toBe('维修熟手');
    expect(SPECIALTY_LABEL.medical).toBe('懂医');
    expect(SPECIALTY_LABEL.watch).toBe('守夜熟手');
    expect(SPECIALTY_LABEL.cook).toBe('会做饭');
    expect(SPECIALTY_LABEL.radio).toBe('懂广播');
  });

  it('describes repaired spaces without level jargon', () => {
    expect([0, 1, 2, 3].map(buildingConditionLabel)).toEqual([
      '还没收拾',
      '刚能用',
      '收拾得像样',
      '已经很稳',
    ]);
  });

  it('turns meal coverage into a human-first sentence', () => {
    expect(mealCoverageLine(1)).toContain('所有人');
    expect(mealCoverageLine(0.9)).toContain('大多数人');
    expect(mealCoverageLine(0.7)).toContain('少吃一点');
    expect(mealCoverageLine(0.4)).toContain('不够分');
  });

  it('turns night preparation bands into lived warnings', () => {
    expect(nightPreparationLine('良好')).toContain('还算稳');
    expect(nightPreparationLine('一般')).toContain('盯紧');
    expect(nightPreparationLine('薄弱')).toContain('太薄');
  });
});
