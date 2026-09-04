import { describe, expect, it } from 'vitest';
import {
  SPECIALTY_LABEL,
  buildingConditionLabel,
  mealCoverageLine,
  nightPreparationLine,
} from '../src/components/v060/copy';

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
      '封着',
      '勉强能用',
      '已经能用',
      '修稳了',
    ]);
  });

  it('turns meal coverage into a human-first sentence', () => {
    expect(mealCoverageLine(1)).toContain('所有人');
    expect(mealCoverageLine(0.9)).toContain('大多数人');
    expect(mealCoverageLine(0.7)).toContain('少吃一点');
    expect(mealCoverageLine(0.4)).toContain('不够分');
  });

  it('describes guard coverage without claiming the physical defense is repaired', () => {
    expect(nightPreparationLine('良好')).toContain('守岗人手较充足');
    expect(nightPreparationLine('一般')).toContain('力量有限');
    expect(nightPreparationLine('薄弱')).toContain('尚未安排守岗');
    for (const band of ['良好', '一般', '薄弱'] as const) expect(nightPreparationLine(band)).not.toMatch(/门墙|已经补过|今晚能守/);
  });
});
