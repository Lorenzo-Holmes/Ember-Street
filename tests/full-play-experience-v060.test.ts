import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DAY_UI = readFileSync('src/V060AppHotfix.tsx', 'utf8');

describe('v0.6 full-play player-facing language', () => {
  it('never renders raw survivor specialty enums in assignment cards', () => {
    expect(DAY_UI).not.toContain('<span>{survivor.specialty}</span>');
    expect(DAY_UI).toContain("search: '熟路'");
    expect(DAY_UI).toContain("repair: '维修熟手'");
    expect(DAY_UI).toContain("cook: '会做饭'");
    expect(DAY_UI).toContain('SPECIALTY_LABEL[survivor.specialty]');
  });

  it('uses repaired-space condition language instead of visible LvN progression', () => {
    expect(DAY_UI).not.toContain('<b>Lv{level}</b>');
    expect(DAY_UI).not.toContain('· Lv${next.level}');
    expect(DAY_UI).toContain("['还没收拾', '刚能用', '收拾得像样', '已经很稳']");
    expect(DAY_UI).toContain('buildingConditionLabel(level)');
  });

  it('puts concrete community consequences before support formulas', () => {
    expect(DAY_UI).not.toContain('炊事 +{summary.cookingCapacity.toFixed(1)}');
    expect(DAY_UI).not.toContain('<strong>夜间风险 -{Math.round(summary.nightRiskReduction * 100)}%</strong>');
    expect(DAY_UI).toContain('能多顾到约 ${summary.cookingCapacity.toFixed(1)} 人份');
    expect(DAY_UI).toContain('夜里的岗能轮得更开');
    expect(DAY_UI).toContain('能多照看 ${summary.medicalAssist} 个轻伤的人');
  });

  it('places the daily assignment before routine building work', () => {
    expect(DAY_UI).toContain('<MissingPanel state={state} setState={setState}/><AssignmentPanel state={state} setState={setState}/><BuildingsPanel state={state} setState={setState}/>');
  });

  it('splits meal and night preparation into lived summary plus hard numbers', () => {
    expect(DAY_UI).toContain('mealCoverageLine(meal.coverage)');
    expect(DAY_UI).toContain('nightPreparationLine(prep.defense)');
    expect(DAY_UI).toContain('约 {meal.cookingCapacity.toFixed(1)} 人份 / 街里 {meal.residentCount} 人');
    expect(DAY_UI).toContain('防线 {prep.defense}');
  });
});
