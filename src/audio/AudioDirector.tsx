import { useEffect, useRef } from 'react';
import type { GameState } from '../game/types';
import { currentNightEvent } from '../game/v060/nightScheduler';
import { AUDIO_PREFERENCES_EVENT, loadAudioPreferences } from './audioPreferences';
import { gameAudio } from './audioRuntime';
import type { AmbienceKey, AudioPreferences } from './audioTypes';

export function ambienceForState(state: GameState): AmbienceKey {
  if (state.phase === 'expedition') return 'expedition_pressure';
  if (state.phase === 'night') return state.nightState.hordeActive || state.day === 29 ? 'horde_pressure' : 'night_ambient';
  if (state.phase === 'night-summary' || state.phase === 'summary' || state.phase === 'dawn' || state.phase === 'ending') return 'dawn_release';
  return 'day_shelter';
}

export default function AudioDirector({ state, disabled = false }: { state: GameState; disabled?: boolean }) {
  const previous = useRef<GameState | null>(null);

  useEffect(() => {
    if (disabled) return undefined;
    const apply = (preferences: AudioPreferences) => gameAudio.setPreferences(preferences);
    apply(loadAudioPreferences());
    const onPreferences = (event: Event) => apply((event as CustomEvent<AudioPreferences>).detail ?? loadAudioPreferences());
    window.addEventListener(AUDIO_PREFERENCES_EVENT, onPreferences);
    const onVisibility = () => gameAudio.setSuspended(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(AUDIO_PREFERENCES_EVENT, onPreferences);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [disabled]);

  useEffect(() => {
    if (!disabled) gameAudio.setAmbience(ambienceForState(state));
  }, [disabled, state.phase, state.day, state.nightState.hordeActive]);

  useEffect(() => {
    if (disabled) return;
    const prior = previous.current;
    const justScheduled = Boolean(prior && !prior.nightState.scheduledEventIds.length && state.nightState.scheduledEventIds.length);
    if (justScheduled) gameAudio.playUiCue('dusk_lock');

    const event = currentNightEvent(state);
    const previousEventId = prior?.nightState.currentEventId ?? null;
    if (event && event.id !== previousEventId) {
      gameAudio.playNightCue(event.audioKey, `${state.seed}:${state.day}:${event.id}`, justScheduled ? 650 : 160);
    }

    if (prior && !prior.pendingCheck?.dice && state.pendingCheck?.dice) gameAudio.playUiCue('dice_roll');
    if (prior && state.nightState.resolutions.length > prior.nightState.resolutions.length) gameAudio.playUiCue('journal_mark', 120);
    previous.current = state;
  }, [disabled, state]);

  return null;
}
