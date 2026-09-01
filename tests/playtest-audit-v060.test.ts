import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIT_POLICIES, runAuditGame, runFullAudit } from '../src/game/v060/playtestAudit';

describe('v0.6 playtest audit simulator', () => {
  it('completes representative DAY1→30 runs for all policy styles', () => {
    for (const policy of DEFAULT_AUDIT_POLICIES) {
      for (const seed of [910001, 910017, 910033]) {
        const result = runAuditGame(seed, policy);
        expect(result.completed, `${policy.id} seed ${seed}: ${result.stalledReason ?? 'not completed'}`).toBe(true);
        expect(result.days).toHaveLength(29);
        expect(result.principles).toHaveLength(3);
      }
    }
  });

  it('is deterministic for the same seed and policy', () => {
    const policy = DEFAULT_AUDIT_POLICIES[1];
    const a = runAuditGame(920123, policy);
    const b = runAuditGame(920123, policy);
    expect(b).toEqual(a);
  });

  it('produces policy, principle, repetition, location and DAY29 diagnostics', () => {
    const report = runFullAudit({ policyRuns: 2, principleRuns: 1, seedBase: 930000 });
    expect(report.totalRuns).toBe(15);
    expect(report.policies.map((row) => row.policyId)).toEqual(['cautious', 'balanced', 'aggressive']);
    expect(report.principles).toHaveLength(9);
    expect(report.diagnostics.residentSuccessBands).toHaveProperty('0-4');
    expect(report.diagnostics).toHaveProperty('dominantDay29Choices');
    expect(report.diagnostics).toHaveProperty('underusedLocations');
    expect(report.diagnostics).toHaveProperty('highRepeatEvents');
  });
});
