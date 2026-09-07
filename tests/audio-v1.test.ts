import { describe, expect, it } from 'vitest';
import '../src/game/v060/nightEventsExpansion';
import { AMBIENCE_AUDIO, NIGHT_AUDIO, UI_AUDIO } from '../src/audio/audioRegistry';
import { ambienceForState } from '../src/audio/AudioDirector';
import { DEFAULT_AUDIO_PREFERENCES, normalizeAudioPreferences } from '../src/audio/audioPreferences';
import { createV060InitialState } from '../src/game/v060/campaign';
import { FINAL_HORDE_EVENTS } from '../src/game/v060/finalHorde';
import { lowHopeDepartureFlag, medicalCrisisFlag } from '../src/game/v060/mortality';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import { ALL_V060_NIGHT_EVENTS } from '../src/game/v060/nightEvents';

describe('Audio Atmosphere & Event SFX v2', () => {
  it('covers all 51 static night definitions with registered local event audio', () => {
    const events = [...ALL_V060_NIGHT_EVENTS, ...FINAL_HORDE_EVENTS];
    expect(events).toHaveLength(51);
    expect(Object.keys(NIGHT_AUDIO)).toHaveLength(19);
    for (const event of events) {
      const asset = NIGHT_AUDIO[event.audioKey];
      expect(asset).toBeDefined();
      expect(asset.src).toMatch(/^\/assets\/audio\/sfx\/[^/]+\.mp3$/);
    }
  });

  it('assigns dynamic medical and departure crises to semantic audio categories', () => {
    const base = { ...createV060InitialState(771001), day: 12 };
    const medical = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia'
        ? { ...survivor, condition: 'critical' as const, untreatedDays: 2 }
        : survivor),
      storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
    };
    expect(mortalityEventById(medical, 'mortality-medical:lin-xia')?.audioKey).toBe('night_medical_care');
    const departure = { ...base, storyFlags: [...base.storyFlags, lowHopeDepartureFlag('zhou')] };
    expect(mortalityEventById(departure, 'mortality-hope:zhou')?.audioKey).toBe('night_departure_steps');
  });

  it('maps campaign phases to five low-density ambience layers', () => {
    const base = createV060InitialState(771002);
    expect(ambienceForState({ ...base, phase: 'street' })).toBe('day_shelter');
    expect(ambienceForState({ ...base, phase: 'expedition' })).toBe('expedition_pressure');
    expect(ambienceForState({ ...base, phase: 'night', nightState: { ...base.nightState, hordeActive: false } })).toBe('night_ambient');
    expect(ambienceForState({ ...base, phase: 'night', nightState: { ...base.nightState, hordeActive: true } })).toBe('horde_pressure');
    expect(ambienceForState({ ...base, phase: 'dawn' })).toBe('dawn_release');
    expect(Object.values(AMBIENCE_AUDIO).every((asset) => asset.src.startsWith('/assets/audio/music/'))).toBe(true);
    expect(Object.keys(UI_AUDIO)).toEqual(['dusk_lock', 'dice_roll', 'journal_mark', 'page_turn', 'pen_circle', 'expedition_loot']);
    expect(UI_AUDIO.page_turn.volume).toBeLessThan(UI_AUDIO.journal_mark.volume);
    expect(UI_AUDIO.pen_circle.volume).toBeLessThan(UI_AUDIO.journal_mark.volume);
  });

  it('separates infected vocals from structural horde impacts', () => {
    const events = [...ALL_V060_NIGHT_EVENTS, ...FINAL_HORDE_EVENTS];
    expect(events.find((event) => event.id === 'horde-approach')?.audioKey).toBe('night_infected_vocal');
    expect(events.find((event) => event.id === 'horde-breakthrough')?.audioKey).toBe('night_infected_vocal');
    expect(events.find((event) => event.id === 'horde-north-gate')?.audioKey).toBe('night_horde_impact');
    expect(events.find((event) => event.id === 'final-horde-reroute')?.audioKey).toBe('night_infected_vocal');
  });

  it('normalizes independent audio preferences without touching game state', () => {
    expect(normalizeAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(normalizeAudioPreferences({ enabled: false, ambience: false, sfx: true, volume: 'high' })).toEqual({
      enabled: false, ambience: false, sfx: true, volume: 'high',
    });
    expect(normalizeAudioPreferences({ volume: 'broken' })).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(createV060InitialState(771003)).not.toHaveProperty('audio');
  });
});
