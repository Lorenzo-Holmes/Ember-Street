import { describe, expect, it } from 'vitest';
import type { GameState, TutorialStage } from '../src/game/types';
import { promoteV2ToV3 } from '../src/game/storage/migrations';
import { rollPendingCheck } from '../src/game/dice';
import { advanceCampaignDay, createV060InitialState, finalizeDay, resolveExpeditionStance, retreatCurrentExpedition } from '../src/game/v060/campaign';
import { assignDayJob, assignExpeditionRoute, lockDayAssignmentsAndRoute } from '../src/game/v060/dayManagement';
import { drawExpeditionEvent, startExpedition } from '../src/game/v060/expedition';
import { acceptNightCheckResult, canAffordNightChoice, chooseNightOption, currentNightEvent, scheduleNight } from '../src/game/v060/nightScheduler';
import { pendingCampaignEvent, resolveCampaignEvent } from '../src/game/v060/campaignEvents';
import { canUpgradeBuilding, upgradeBuilding } from '../src/game/v060/buildings';
import { appendJournal, JOURNAL_LIMIT, normalizeJournal } from '../src/game/v060/journal';
import {
  acknowledgeTutorialPage, completeTutorialFromLog, createTutorialState, dismissTutorialNotice,
  normalizeTutorial, reconcileTutorial, skipTutorial, TUTORIAL_STAGES, tutorialDispatchBlocker,
  tutorialIsActive, tutorialLogHasPriority,
} from '../src/game/v060/tutorial';

const fresh = (seed = 910601): GameState => ({ ...createV060InitialState(seed), tutorial: createTutorialState() });
const at = (tutorialStage: TutorialStage): GameState => ({ ...fresh(), tutorial: { ...createTutorialState(), tutorialStage } });
const restore = (state: GameState): GameState => promoteV2ToV3(JSON.parse(JSON.stringify(state)))!;

function assignAndDepart(state: GameState): GameState {
  let next = reconcileTutorial(assignDayJob(state, 'ahe', 'cook'));
  next = reconcileTutorial(assignExpeditionRoute(next, 'lin-xia', 'convenience-store'));
  next = lockDayAssignmentsAndRoute(next);
  next = startExpedition({ ...next, dayState: { ...next.dayState, expeditionQueue: [] } }, ['lin-xia'], 'convenience-store', true);
  return reconcileTutorial({ ...drawExpeditionEvent(next), phase: 'expedition' });
}

function drainNight(input: GameState): GameState {
  let state = scheduleNight(input);
  for (let guard = 0; guard < 30 && state.phase === 'night'; guard++) {
    const event = currentNightEvent(state);
    expect(event).not.toBeNull();
    const choice = event!.choices.find((item) => !item.check && canAffordNightChoice(state, item))
      ?? event!.choices.find((item) => canAffordNightChoice(state, item));
    expect(choice).toBeDefined();
    state = chooseNightOption(state, choice!.id);
    if (state.pendingCheck) state = acceptNightCheckResult(rollPendingCheck(state));
    state = reconcileTutorial(state);
  }
  expect(state.phase).toBe('night-summary');
  return state;
}

describe('Tutorial / New Player Experience v1', () => {
  it('only advances explanatory pages explicitly; viewing a person or invalid work does not count', () => {
    const intro = fresh();
    expect(reconcileTutorial(intro).tutorial?.tutorialStage).toBe('INTRO');
    const resources = acknowledgeTutorialPage(intro);
    expect(resources.tutorial?.tutorialStage).toBe('RESOURCE_OVERVIEW');
    const work = acknowledgeTutorialPage(resources);
    expect(work.tutorial?.tutorialStage).toBe('ASSIGN_SURVIVOR');
    expect(acknowledgeTutorialPage(work)).toBe(work);
    expect(reconcileTutorial(assignDayJob(work, 'ahe', 'medical')).tutorial?.tutorialStage).toBe('ASSIGN_SURVIVOR');
    expect(tutorialDispatchBlocker(work)).toBeDefined();
  });

  it('walks real work, expedition, dusk, every night choice, DAY2 log and free play', () => {
    let state = assignAndDepart(at('ASSIGN_SURVIVOR'));
    expect(state.tutorial?.tutorialStage).toBe('SEND_EXPEDITION');
    expect(state.campaignStats.expeditions).toBe(1);
    state = reconcileTutorial({ ...resolveExpeditionStance(state, 'careful'), phase: 'dusk' });
    expect(state.tutorial?.tutorialStage).toBe('END_DAY');
    expect(state.journal?.some((entry) => entry.kind === 'expedition' && entry.title.includes('林夏'))).toBe(true);
    state = reconcileTutorial(finalizeDay(state));
    expect(state.tutorial?.tutorialStage).toBe('FIRST_NIGHT');
    state = drainNight(state);
    state = reconcileTutorial(advanceCampaignDay(state));
    expect(state.day).toBe(2);
    expect(state.tutorial?.tutorialStage).toBe('OPEN_LOG');
    expect(state.tutorial?.tutorialCompleted).toBe(false);
    expect(state.journal?.some((entry) => entry.body.includes('阿禾：炊事'))).toBe(true);
    expect(state.journal?.some((entry) => entry.title === '围栏外有人敲门' && entry.body.includes('选择：'))).toBe(true);
    state = completeTutorialFromLog(state);
    expect(state.tutorial?.tutorialCompleted).toBe(true);
    expect(state.tutorial?.tutorialStage).toBe('FREE_PLAY');
    expect(tutorialDispatchBlocker(state)).toBeUndefined();
    expect(tutorialLogHasPriority(state, true)).toBe(true);
    expect(tutorialLogHasPriority(state, false)).toBe(false);
    expect(dismissTutorialNotice(state).tutorial?.freePlayNoticeSeen).toBe(true);
  });

  it('accepts retreat without inventing loot or making the tutorial unwinnable', () => {
    const expedition = assignAndDepart(at('ASSIGN_SURVIVOR'));
    const retreated = reconcileTutorial({ ...retreatCurrentExpedition(expedition), phase: 'dusk' });
    expect(retreated.inventory).toEqual(expedition.inventory);
    expect(retreated.tutorial?.tutorialStage).toBe('END_DAY');
    expect(retreated.journal?.[0].body).toContain('撤回街里');
    expect(retreatCurrentExpedition(retreated)).toEqual(retreated);
  });

  it('requires a real route and keeps choices editable before departure', () => {
    let state = reconcileTutorial(assignDayJob(at('ASSIGN_SURVIVOR'), 'ahe', 'cook'));
    expect(state.tutorial?.tutorialStage).toBe('SEND_EXPEDITION');
    expect(tutorialDispatchBlocker(state)).toBeDefined();
    state = reconcileTutorial(assignDayJob(state, 'lin-xia', 'expedition'));
    expect(tutorialDispatchBlocker(state)).toBeDefined();
    state = reconcileTutorial(assignExpeditionRoute(state, 'lin-xia', 'convenience-store'));
    expect(tutorialDispatchBlocker(state)).toBeUndefined();
    state = reconcileTutorial(assignDayJob(state, 'ahe', 'expedition'));
    expect(state.tutorial?.tutorialStage).toBe('ASSIGN_SURVIVOR');
    expect(tutorialDispatchBlocker(state)).toBeDefined();
  });

  it('never completes merely by opening the log on DAY1', () => {
    expect(completeTutorialFromLog(at('OPEN_LOG')).tutorial?.tutorialCompleted).toBe(false);
  });

  it.each(TUTORIAL_STAGES)('skip is persistent and non-destructive from %s', (tutorialStage) => {
    const original = at(tutorialStage);
    const skipped = skipTutorial(original);
    const { tutorial: ignored, ...gameplay } = skipped;
    const { tutorial: originalTutorial, ...originalGameplay } = original;
    expect(gameplay).toEqual(originalGameplay);
    expect(ignored?.tutorialSkipped).toBe(true);
    expect(originalTutorial?.tutorialSkipped).toBe(false);
    expect(tutorialIsActive(restore(skipped))).toBe(false);
    expect(tutorialDispatchBlocker(skipped)).toBeUndefined();
  });

  it('restores work and a live expedition without redispatch or duplicate rewards', () => {
    const assigned = reconcileTutorial(assignDayJob(at('ASSIGN_SURVIVOR'), 'ahe', 'cook'));
    expect(restore(assigned).tutorial).toEqual(assigned.tutorial);
    const expedition = assignAndDepart(at('ASSIGN_SURVIVOR'));
    const restored = restore(expedition);
    expect(restored.expeditionState).toEqual(expedition.expeditionState);
    expect(restored.inventory).toEqual(expedition.inventory);
    expect(restored.rngState).toBe(expedition.rngState);
    // Compare normalized saves: migration legitimately fills optional empty ledgers.
    expect(restore(resolveExpeditionStance(restored, 'careful'))).toEqual(restore(resolveExpeditionStance(expedition, 'careful')));
  });

  it('schedules one real first event without changing RNG, budgets or horde probabilities', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const normal = finalizeDay(createV060InitialState(seed));
      const guided = { ...normal, tutorial: createTutorialState() };
      const scheduled = scheduleNight(guided);
      const control = scheduleNight(normal);
      expect(scheduled.nightState.scheduledEventIds[0]).toBe('gate-knocking');
      expect(new Set(scheduled.nightState.scheduledEventIds).size).toBe(scheduled.nightState.eventTotal);
      expect(scheduled.nightState.eventTotal).toBe(control.nightState.eventTotal);
      expect(scheduled.nightState.hordeActive).toBe(control.nightState.hordeActive);
      expect(scheduled.nightState.emergencyEventIds).toEqual(control.nightState.emergencyEventIds);
      expect(scheduled.rngState).toBe(control.rngState);
    }
  });

  it('preserves a paid/rolled night decision across reload without a second payment or reroll', () => {
    let state = scheduleNight(finalizeDay(at('FIRST_NIGHT')));
    state = chooseNightOption(state, 'verify');
    expect(state.pendingCheck).not.toBeNull();
    const beforeRoll = restore(state);
    const rolled = rollPendingCheck(beforeRoll);
    const restored = restore(rolled);
    expect(restored.pendingCheck).toEqual(rolled.pendingCheck);
    expect(rollPendingCheck(restored)).toEqual(restored);
    expect(scheduleNight(restored)).toBe(restored);
    const settled = acceptNightCheckResult(restored);
    expect(acceptNightCheckResult(settled)).toBe(settled);
    expect(settled.journal?.filter((entry) => entry.title.includes('围栏外有人敲门'))).toHaveLength(2);
  });

  it('cannot settle dinner or redraw the same night twice', () => {
    const night = finalizeDay(fresh());
    expect(finalizeDay(night)).toBe(night);
    const scheduled = scheduleNight(night);
    expect(scheduleNight(restore(scheduled))).toEqual(restore(scheduled));
  });

  it.each([1, 2, 12, 29])('loads a legacy v3 DAY%d without opting into tutorial or changing the phase', (day) => {
    const old = { ...createV060InitialState(901), day, phase: 'dusk' as const };
    const migrated = restore(old);
    expect(migrated.tutorial).toBeUndefined();
    expect(migrated.day).toBe(day);
    expect(migrated.phase).toBe('dusk');
    expect(migrated.inventory).toEqual(old.inventory);
  });

  it('also tolerates legacy v2 and malformed tutorial data', () => {
    expect(promoteV2ToV3({ version: 2, day: 15, seed: 123 })?.tutorial).toBeUndefined();
    expect(normalizeTutorial(null)).toBeUndefined();
    expect(normalizeTutorial({ version: 99, tutorialStage: 'INTRO' })).toBeUndefined();
    expect(normalizeTutorial({ version: 1, tutorialStage: 'not-a-stage' })).toBeUndefined();
    expect(normalizeTutorial({ ...createTutorialState(), hintsSeen: 'wrong', tutorialSkipped: true })?.hintsSeen).toEqual([]);
    expect(reconcileTutorial({ ...fresh(), day: 12 }).tutorial?.tutorialCompleted).toBe(true);
  });

  it('persists dismissed contextual hints independently from core progress', () => {
    const completed = completeTutorialFromLog(reconcileTutorial({ ...fresh(), day: 2 }));
    const dismissed = dismissTutorialNotice(dismissTutorialNotice(completed), 'injury');
    expect(restore(dismissed).tutorial?.hintsSeen).toEqual(['injury']);
    expect(dismissTutorialNotice(dismissed, 'injury').tutorial?.hintsSeen).toEqual(['injury']);
  });

  it('bounds and validates the extended journal and deduplicates stable entry IDs', () => {
    let state = fresh();
    for (let i = 0; i < JOURNAL_LIMIT + 10; i++) state = appendJournal(state, { id: `${i}`, day: 1, kind: 'work', title: '清点', body: '口粮 -3。' });
    expect(state.journal).toHaveLength(JOURNAL_LIMIT);
    expect(appendJournal(state, state.journal![0])).toBe(state);
    expect(normalizeJournal([null, {}, state.journal![0], state.journal![0]])).toHaveLength(1);
    expect(normalizeJournal([...state.journal!, state.journal![0]])).toHaveLength(JOURNAL_LIMIT);
    expect(restore(state).journal).toEqual(state.journal);
  });

  it('completed onboarding has zero gameplay effects from DAY2 through the DAY30 ending', () => {
    let state: GameState = { ...fresh(99102), day: 2, tutorial: { ...createTutorialState(), tutorialStage: 'FREE_PLAY', tutorialCompleted: true, freePlayNoticeSeen: true } };
    for (; state.day < 30;) {
      state = { ...state, inventory: { ration: 999, medicine: 99, power: 100, materials: 999, parts: 99 }, hope: 85, defense: 90 };
      for (let i = 0; i < 20; i++) {
        const event = pendingCampaignEvent(state);
        if (!event) break;
        state = resolveCampaignEvent(state, event.id);
      }
      if (canUpgradeBuilding(state, 'workshop').allowed) state = upgradeBuilding(state, 'workshop');
      const { tutorial: ignored, ...control } = state;
      expect(ignored?.tutorialCompleted).toBe(true);
      const guidedNight = drainNight(finalizeDay(state));
      const controlNight = drainNight(finalizeDay(control));
      const { tutorial: retained, ...guidedGameplay } = guidedNight;
      expect(retained?.tutorialCompleted).toBe(true);
      expect(guidedGameplay).toEqual(controlNight);
      state = restore(reconcileTutorial(advanceCampaignDay(guidedNight)));
    }
    expect(state.phase).toBe('ending');
    expect(state.ending).not.toBeNull();
    expect(state.finalHordeResult).toBeDefined();
  });
});
