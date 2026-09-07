export type AudioVolumePreset = 'low' | 'medium' | 'high';

export interface AudioPreferences {
  enabled: boolean;
  ambience: boolean;
  sfx: boolean;
  volume: AudioVolumePreset;
}

export type AmbienceKey =
  | 'day_shelter'
  | 'night_ambient'
  | 'horde_pressure'
  | 'expedition_pressure'
  | 'dawn_release';

export type UiAudioCueKey = 'dusk_lock' | 'dice_roll' | 'journal_mark';

export interface AudioAssetDefinition {
  src: string;
  volume: number;
  loop?: boolean;
}
