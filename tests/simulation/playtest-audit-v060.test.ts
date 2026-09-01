import { describe, expect, it } from 'vitest';
import type { V060NightEvent } from '../../src/game/v060/nightEvents';
import { canTakeDayAssignment } from '../../src/game/v060/dayManagement';
import { eligibleEvent } from '../../src/game/v060/nightScheduler';
import { resolveEnding } from '../../src/game/v060/endings';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { EXPEDITION_LOCATIONS } from '../../src/game/v060/expedition';
import { buildCommunityStressRows } from '../../tools/simulation/communityStress';
import { auditDay29Choices, generateDay29States } from '../../tools/simulation/day29';
import { assertStateInvariants, simulateRun } from '../../tools/simulation/engine';
import { allPolicies, strongPolicy } from '../../tools/simulation/policies';

const dummyChoices: V060NightEvent['choices'] = [
  { id: 'a', label: 'a', detail: 'a', strategy: 'consequence', direct: {} },
  { id: 'b', label: 'b', detail: 'b', strategy: 'consequence', direct: {} },
  { id: 'c', label: 'c', detail: 'c', strategy: 'consequence', direct: {} },
];

describe('v0.6 playtest audit simulator', () => {
  it('is deterministic for the same version + seed + policy', () => {
    const policy = strongPolicy();
    const a = simulateRun(606101, policy);
    const b = simulateRun(606101, policy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('contains Random plus four heuristic policy families and nine principle counterfactuals', () => {
    const ids = allPolicies().map((policy) => policy.id);
    expect(ids).toContain('random');
    expect(ids).toContain('survival-greedy');
    expect(ids).toContain('production-greedy');
    expect(ids).toContain('exploration-greedy');
    expect(ids).toContain('strong-heuristic');
    expect(ids.filter((id) => id.startsWith('principle-greedy:'))).toHaveLength(9);
  });

  it('never lets dead, missing, critical, or committed survivors take a new job', () => {
    const base = createV060InitialState(606102);
    const survivorId = base.survivors[0].id;
    const dead = { ...base, survivors: base.survivors.map((survivor) => survivor.id === survivorId ? { ...survivor, condition: 'dead' as const } : survivor) };
    const missing = { ...base, survivors: base.survivors.map((survivor) => survivor.id === survivorId ? { ...survivor, condition: 'missing' as const } : survivor) };
    const critical = { ...base, survivors: base.survivors.map((survivor) => survivor.id === survivorId ? { ...survivor, condition: 'critical' as const } : survivor) };
    const committed = { ...base, dayState: { ...base.dayState, committedSurvivorIds: [survivorId] } };
    expect(canTakeDayAssignment(dead, survivorId, 'rest').allowed).toBe(false);
    expect(canTakeDayAssignment(missing, survivorId, 'rest').allowed).toBe(false);
    expect(canTakeDayAssignment(critical, survivorId, 'rest').allowed).toBe(false);
    expect(canTakeDayAssignment(committed, survivorId, 'rest').allowed).toBe(false);
  });

  it('keeps event eligibility bound to present survivors', () => {
    const base = createV060InitialState(606103);
    const event: V060NightEvent = {
      id: 'audit-required-survivor', category: 'survivor', minDay: 1, maxDay: 29,
      title: 'audit', body: 'audit', requiredSurvivorIds: ['lin-xia'], choices: dummyChoices,
    };
    expect(eligibleEvent(base, event)).toBe(true);
    const missing = { ...base, survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'missing' as const } : survivor) };
    expect(eligibleEvent(missing, event)).toBe(false);
  });

  it('keeps community support bounded and population inputs valid through 30 residents', () => {
    const rows = buildCommunityStressRows();
    expect(rows.some((row) => row.residentPopulation > 25)).toBe(true);
    for (const row of rows) {
      expect(row.residentPopulation).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(row.communityLabor)).toBe(true);
      expect(row.cookingCapacity).toBeGreaterThanOrEqual(0);
      expect(row.cookingCapacity).toBeLessThanOrEqual(8);
      expect(row.repairSupport).toBeGreaterThanOrEqual(0);
      expect(row.repairSupport).toBeLessThanOrEqual(6);
      expect(row.medicalSupport).toBeGreaterThanOrEqual(0);
      expect(row.medicalSupport).toBeLessThanOrEqual(2);
      expect(row.defenseRiskReduction).toBeGreaterThanOrEqual(0);
      expect(row.defenseRiskReduction).toBeLessThanOrEqual(0.12);
      expect(row.rationNeeded).toBeGreaterThanOrEqual(row.residentPopulation);
    }
  });

  it('keeps the location catalog unique and stable', () => {
    const ids = EXPEDITION_LOCATIONS.map((location) => location.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(10);
    for (const location of EXPEDITION_LOCATIONS) {
      expect(location.danger).toBeGreaterThanOrEqual(1);
      expect(location.danger).toBeLessThanOrEqual(5);
      expect(location.signatureEventId.length).toBeGreaterThan(0);
    }
  });

  it('evaluates endings deterministically without mutating the source state', () => {
    const run = simulateRun(606104, strongPolicy());
    const state = structuredClone(run.finalState);
    const before = JSON.stringify(state);
    const a = resolveEnding(state);
    const b = resolveEnding(structuredClone(state));
    expect(a).toEqual(b);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('generates deterministic DAY29 states and forks without mutating their source snapshots', () => {
    const statesA = generateDay29States(292900, 24);
    const statesB = generateDay29States(292900, 24);
    expect(JSON.stringify(statesA)).toBe(JSON.stringify(statesB));
    const before = JSON.stringify(statesA);
    const a = auditDay29Choices(292901, 12);
    const b = auditDay29Choices(292901, 12);
    expect(a).toEqual(b);
    expect(JSON.stringify(statesA)).toBe(before);
    expect(a.length).toBeGreaterThan(0);
  });

  it('runs 1000 complete seeded campaigns without crashes, illegal policy actions, NaN, or negative populations', () => {
    const policies = allPolicies();
    for (let index = 0; index < 1000; index += 1) {
      const policy = policies[index % policies.length];
      const seed = 607000 + Math.floor(index / policies.length);
      const run = simulateRun(seed, policy);
      expect(run.finalState.day).toBe(30);
      expect(run.finalState.phase).toBe('ending');
      expect(run.finalState.ending).not.toBeNull();
      expect(run.illegalActionCount).toBe(0);
      expect(run.finalState.civilianResidents).toBeGreaterThanOrEqual(0);
      expect(run.daily).toHaveLength(29);
      assertStateInvariants(run.finalState);
      for (const day of run.daily) {
        expect(Number.isFinite(day.food)).toBe(true);
        expect(Number.isFinite(day.dailyNetResources)).toBe(true);
        expect(day.population).toBeGreaterThanOrEqual(0);
        expect(day.residentPopulation).toBeGreaterThanOrEqual(0);
      }
    }
  }, 120_000);
});
