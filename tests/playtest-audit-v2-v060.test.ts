import { describe, expect, it } from 'vitest';
import { V2_AUDIT_POLICIES, runAuditGameV2 } from '../src/game/v060/playtestAuditV2';

describe('v0.6 playtest audit v2', () => {
  it('finishes representative seeds with corrected policy scheduling', () => {
    for (const policy of V2_AUDIT_POLICIES) {
      const run = runAuditGameV2(910001 + policy.id.length, policy);
      expect(run.completed).toBe(true);
      expect(run.days).toHaveLength(29);
      expect(run.hotMealDays).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed, policy and resident injection', () => {
    const policy = V2_AUDIT_POLICIES.find((item) => item.id === 'rescue-v2')!;
    const options = { residentInjection: { day: 14, count: 8 } };
    const a = runAuditGameV2(910077, policy, options);
    const b = runAuditGameV2(910077, policy, options);
    expect(a).toEqual(b);
  });

  it('covers controlled 9+ resident states when requested', () => {
    const policy = V2_AUDIT_POLICIES.find((item) => item.id === 'balanced-v2')!;
    const run = runAuditGameV2(910099, policy, { residentInjection: { day: 14, count: 10 } });
    expect(run.completed).toBe(true);
    expect(run.peakResidents).toBeGreaterThanOrEqual(10);
  });
});
