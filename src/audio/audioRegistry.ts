import type { NightAudioKey } from '../game/v060/nightEvents';
import type { AmbienceKey, AudioAssetDefinition, UiAudioCueKey } from './audioTypes';

export const AMBIENCE_AUDIO: Readonly<Record<AmbienceKey, AudioAssetDefinition>> = {
  day_shelter: { src: '/assets/audio/music/bgm_day_shelter.mp3', volume: 0.24, loop: true },
  night_ambient: { src: '/assets/audio/music/bgm_night_ambient.mp3', volume: 0.23, loop: true },
  horde_pressure: { src: '/assets/audio/music/bgm_horde_pressure.mp3', volume: 0.28, loop: true },
  expedition_pressure: { src: '/assets/audio/music/bgm_expedition_pressure.mp3', volume: 0.24, loop: true },
  dawn_release: { src: '/assets/audio/music/bgm_dawn_release.mp3', volume: 0.24, loop: false },
};

export const NIGHT_AUDIO: Readonly<Record<NightAudioKey, AudioAssetDefinition>> = {
  night_door_knock: { src: '/assets/audio/sfx/sfx_door_knock.mp3', volume: 0.58 },
  night_medical_care: { src: '/assets/audio/sfx/sfx_medical_care.mp3', volume: 0.48 },
  night_injured_return: { src: '/assets/audio/sfx/sfx_injured_return.mp3', volume: 0.54 },
  night_conflict_murmur: { src: '/assets/audio/sfx/sfx_conflict_murmur.mp3', volume: 0.44 },
  night_distant_threat: { src: '/assets/audio/sfx/sfx_distant_threat.mp3', volume: 0.50 },
  night_horde_impact: { src: '/assets/audio/sfx/sfx_horde_impact.mp3', volume: 0.58 },
  night_empty_space: { src: '/assets/audio/sfx/sfx_empty_space.mp3', volume: 0.38 },
  night_storage_rustle: { src: '/assets/audio/sfx/sfx_storage_rustle.mp3', volume: 0.46 },
  night_quiet_room: { src: '/assets/audio/sfx/sfx_quiet_room.mp3', volume: 0.36 },
  night_package_drop: { src: '/assets/audio/sfx/sfx_package_drop.mp3', volume: 0.48 },
  night_departure_steps: { src: '/assets/audio/sfx/sfx_departure_steps.mp3', volume: 0.47 },
  night_power_failure: { src: '/assets/audio/sfx/sfx_power_failure.mp3', volume: 0.50 },
  night_radio_static: { src: '/assets/audio/sfx/sfx_radio_static.mp3', volume: 0.45 },
  night_radio_burst: { src: '/assets/audio/sfx/sfx_radio_burst.mp3', volume: 0.50 },
  night_structure_creak: { src: '/assets/audio/sfx/sfx_structure_creak.mp3', volume: 0.50 },
  night_fire_hiss: { src: '/assets/audio/sfx/sfx_fire_hiss.mp3', volume: 0.48 },
  night_dogs: { src: '/assets/audio/sfx/sfx_dogs.mp3', volume: 0.47 },
  night_alarm: { src: '/assets/audio/sfx/sfx_alarm.mp3', volume: 0.50 },
};

export const UI_AUDIO: Readonly<Record<UiAudioCueKey, AudioAssetDefinition>> = {
  dusk_lock: { src: '/assets/audio/sfx/sfx_dusk_lock.mp3', volume: 0.55 },
  dice_roll: { src: '/assets/audio/sfx/sfx_dice_roll.mp3', volume: 0.52 },
  journal_mark: { src: '/assets/audio/sfx/sfx_journal_mark.mp3', volume: 0.40 },
};
