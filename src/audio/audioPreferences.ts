import type { AudioPreferences, AudioVolumePreset } from './audioTypes';

export const AUDIO_PREFERENCES_KEY = 'ember-street-audio-v1';
export const AUDIO_PREFERENCES_EVENT = 'ember-street-audio-preferences';

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  enabled: true,
  ambience: true,
  sfx: true,
  volume: 'medium',
};

const VOLUME_PRESETS: AudioVolumePreset[] = ['low', 'medium', 'high'];

export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_AUDIO_PREFERENCES };
  const raw = value as Partial<AudioPreferences>;
  return {
    enabled: raw.enabled !== false,
    ambience: raw.ambience !== false,
    sfx: raw.sfx !== false,
    volume: VOLUME_PRESETS.includes(raw.volume as AudioVolumePreset) ? raw.volume as AudioVolumePreset : 'medium',
  };
}

export function loadAudioPreferences(): AudioPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFERENCES_KEY);
    return raw ? normalizeAudioPreferences(JSON.parse(raw)) : { ...DEFAULT_AUDIO_PREFERENCES };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveAudioPreferences(next: AudioPreferences): AudioPreferences {
  const normalized = normalizeAudioPreferences(next);
  if (typeof window === 'undefined') return normalized;
  try { window.localStorage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(normalized)); } catch { /* Temporary sessions still work. */ }
  window.dispatchEvent(new CustomEvent(AUDIO_PREFERENCES_EVENT, { detail: normalized }));
  return normalized;
}
