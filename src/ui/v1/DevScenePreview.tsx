import { SURVIVOR_ROSTER, forecastFor } from '../../game/progression';
import type { GameState } from '../../game/types';
import { createV060InitialState } from '../../game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../game/v060/campaignEvents';
import { ENDINGS } from '../../game/v060/endings';
import { ALL_V060_NIGHT_EVENTS } from '../../game/v060/nightEvents';
import { chooseNightOption, scheduleNight } from '../../game/v060/nightScheduler';

export type PreviewScene = 'home' | 'defense' | 'defense-dusk' | 'defense-dawn' | 'event' | 'missing' | 'dusk' | 'night' | 'dice' | 'horde' | 'night-summary' | 'dawn' | 'ending';

const SCENES: Array<[PreviewScene, string]> = [
  ['home', '据点'],
  ['defense', '低防线据点'],
  ['defense-dusk', '低防线黄昏'],
  ['defense-dawn', '防线清点'],
  ['event', '特殊事件'],
  ['missing', '有人未归'],
  ['dusk', '黄昏'],
  ['night', '夜间事件'],
  ['dice', '投骰'],
  ['horde', '尸潮'],
  ['night-summary', '夜后'],
  ['dawn', '天亮'],
  ['ending', '结局'],
];

export function previewSceneFromLocation(): PreviewScene | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('scene');
  return SCENES.some(([id]) => id === value) ? value as PreviewScene : null;
}

function previewBase(day = 8): GameState {
  const base = createV060InitialState(606060);
  return {
    ...base,
    day,
    forecast: forecastFor(day),
    civilianResidents: 6,
    survivors: SURVIVOR_ROSTER.map((survivor) => ({ ...survivor })),
    inventory: { ration: 10, medicine: 4, power: 42, materials: 6, parts: 3 },
    buildings: { searchStation: 2, workshop: 2, clinic: 1, watchPost: 2, shelter: 2, radio: 1 },
    defense: 58,
    hope: 46,
    dayAssignments: { 'lin-xia': 'watch', zhou: 'repair', ahe: 'cook', cheng: 'medical', aliang: 'watch', xiaoman: 'radio' },
    dayState: { ...base.dayState, assignmentsLocked: true },
  };
}

export function createPreviewState(scene: PreviewScene): GameState {
  if (scene === 'home') return createV060InitialState(606060);
  if (scene === 'defense' || scene === 'defense-dusk' || scene === 'defense-dawn') {
    const base = previewBase(9);
    return {
      ...base,
      phase: scene === 'defense' ? 'street' : scene === 'defense-dusk' ? 'dusk' : 'summary',
      defense: 28,
      socialState: { ...base.socialState!, principles: ['everyone-shares'], lastRequestDay: base.day },
      dayState: { ...base.dayState, assignmentsLocked: scene !== 'defense' },
      storyFlags: [...base.storyFlags, ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`)],
      defenseNight: { day: scene === 'defense-dawn' ? 9 : 8, start: 36, end: 28, reinforced: 2, damaged: 10, complete: true },
      dawnBrief: ['北门遭到撞击。防线受损（−10），现为 26/100。', '门后补上了支撑。防线增强（+2），现为 28/100。'],
    };
  }
  if (scene === 'event') {
    const base = createV060InitialState(606060);
    return { ...base, storyFlags: [...base.storyFlags, 'building_event_pending:shelter'] };
  }
  if (scene === 'missing') {
    const base = previewBase(9);
    return {
      ...base,
      phase: 'assignment',
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'missing' } : survivor),
      campaignStats: { ...base.campaignStats, missing: 1 },
      storyFlags: [...base.storyFlags, ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`)],
      dayAssignments: {},
      dayState: { ...base.dayState, assignmentsLocked: false },
    };
  }

  const dusk = { ...previewBase(), phase: 'dusk' as const };
  if (scene === 'dusk') return dusk;

  if (scene === 'horde') return scheduleNight({ ...previewBase(29), phase: 'dusk' });

  const night = scheduleNight(dusk);
  if (scene === 'night') return night;

  if (scene === 'dice') {
    const event = ALL_V060_NIGHT_EVENTS.find((candidate) => candidate.minDay <= dusk.day && candidate.maxDay >= dusk.day && candidate.choices.some((choice) => choice.check));
    if (!event) return night;
    const choice = event.choices.find((candidate) => candidate.check);
    if (!choice) return night;
    const staged: GameState = {
      ...night,
      nightState: { ...night.nightState, currentEventId: event.id, scheduledEventIds: [event.id], eventTotal: 1 },
    };
    return chooseNightOption(staged, choice.id);
  }

  const summary: GameState = {
    ...night,
    phase: 'night-summary',
    nightState: { ...night.nightState, currentEventId: null, eventIndex: 2, eventTotal: 2, resolutions: ['preview-a', 'preview-b'] },
  };
  if (scene === 'night-summary') return summary;
  if (scene === 'dawn') return {
    ...summary,
    phase: 'summary',
    dawnBrief: ['街口的门板裂了一块，天亮后已经重新钉上。', '诊疗室整夜有人守着，伤员的情况暂时稳住。'],
    campaignStats: { ...summary.campaignStats, rescued: 3, missing: 1 },
  };

  return {
    ...previewBase(30),
    day: 30,
    phase: 'ending',
    chapterComplete: true,
    finalHordeResult: 'held',
    ending: ENDINGS.E02,
    campaignStats: { ...previewBase(30).campaignStats, rescued: 7, expeditions: 18, locationsDiscovered: 8 },
  };
}

export function DevSceneNav({ active }: { active: PreviewScene | null }) {
  if (!import.meta.env.DEV || !active) return null;
  return (
    <details className="v1-dev-scenes">
      <summary>场景预览</summary>
      <nav>
        <a className={!active ? 'active' : ''} href="?">正常存档</a>
        {SCENES.map(([id, label]) => <a className={active === id ? 'active' : ''} href={`?scene=${id}`} key={id}>{label}</a>)}
      </nav>
      <small>预览中的选择不会写进正式存档。</small>
    </details>
  );
}
