import type { NightAudioKey } from '../game/v060/nightEvents';
import { AMBIENCE_AUDIO, NIGHT_AUDIO, UI_AUDIO } from './audioRegistry';
import { loadAudioPreferences } from './audioPreferences';
import type { AmbienceKey, AudioAssetDefinition, AudioPreferences, UiAudioCueKey } from './audioTypes';

const PLAYED_SESSION_KEY = 'ember-street-audio-played-v1';
const VOLUME_MULTIPLIER: Record<AudioPreferences['volume'], number> = { low: 0.55, medium: 0.78, high: 1 };

function safePlay(audio: HTMLAudioElement): void {
  const result = audio.play();
  if (result && typeof result.catch === 'function') result.catch(() => undefined);
}

function sessionPlayed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(PLAYED_SESSION_KEY);
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch { return new Set(); }
}

function rememberSessionCue(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = [...sessionPlayed(), key].slice(-120);
    window.sessionStorage.setItem(PLAYED_SESSION_KEY, JSON.stringify([...new Set(keys)]));
  } catch { /* Session-only de-duplication is optional. */ }
}

class EmberAudioRuntime {
  private unlocked = false;
  private suspended = false;
  private preferences = loadAudioPreferences();
  private ambienceKey: AmbienceKey | null = null;
  private ambience: HTMLAudioElement | null = null;
  private activeSfx: HTMLAudioElement | null = null;
  private fadeTimer: number | null = null;
  private duckTimer: number | null = null;

  unlock(): void {
    this.unlocked = true;
    if (typeof Audio === 'undefined' || !this.preferences.enabled) return;
    const probe = new Audio(UI_AUDIO.journal_mark.src);
    probe.preload = 'auto';
    probe.volume = 0.001;
    safePlay(probe);
    window.setTimeout(() => { probe.pause(); probe.currentTime = 0; this.refreshAmbience(); }, 80);
  }

  setPreferences(next: AudioPreferences): void {
    this.preferences = next;
    if (!next.enabled || !next.ambience) this.pauseAmbience();
    else this.refreshAmbience();
    if (!next.enabled || !next.sfx) this.stopSfx();
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) this.pauseAmbience();
    else this.refreshAmbience();
  }

  setAmbience(key: AmbienceKey): void {
    if (this.ambienceKey === key) { this.refreshAmbience(); return; }
    this.ambienceKey = key;
    if (!this.canPlayAmbience()) return;
    this.crossfadeTo(key);
  }

  playNightCue(key: NightAudioKey, instanceKey: string, delayMs = 120): void {
    const cueKey = `night:${instanceKey}`;
    if (sessionPlayed().has(cueKey)) return;
    rememberSessionCue(cueKey);
    window.setTimeout(() => this.playSfx(NIGHT_AUDIO[key]), delayMs);
  }

  playUiCue(key: UiAudioCueKey, delayMs = 0): void {
    window.setTimeout(() => this.playSfx(UI_AUDIO[key]), delayMs);
  }

  stopAll(): void {
    this.ambienceKey = null;
    this.stopSfx();
    if (this.ambience) { this.ambience.pause(); this.ambience = null; }
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.fadeTimer = null;
    this.duckTimer = null;
  }

  private canPlayAmbience(): boolean {
    return this.unlocked && !this.suspended && this.preferences.enabled && this.preferences.ambience && typeof Audio !== 'undefined';
  }

  private targetVolume(asset: AudioAssetDefinition): number {
    return Math.max(0, Math.min(1, asset.volume * VOLUME_MULTIPLIER[this.preferences.volume]));
  }

  private refreshAmbience(): void {
    if (!this.ambienceKey || !this.canPlayAmbience()) return;
    if (!this.ambience) { this.crossfadeTo(this.ambienceKey); return; }
    const asset = AMBIENCE_AUDIO[this.ambienceKey];
    this.ambience.volume = this.targetVolume(asset);
    safePlay(this.ambience);
  }

  private pauseAmbience(): void { this.ambience?.pause(); }

  private crossfadeTo(key: AmbienceKey): void {
    if (typeof Audio === 'undefined') return;
    const asset = AMBIENCE_AUDIO[key];
    const next = new Audio(asset.src);
    next.preload = 'auto';
    next.loop = asset.loop === true;
    next.volume = 0;
    safePlay(next);
    const previous = this.ambience;
    this.ambience = next;
    const target = this.targetVolume(asset);
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    let step = 0;
    this.fadeTimer = window.setInterval(() => {
      step += 1;
      next.volume = Math.min(target, target * step / 6);
      if (previous) previous.volume = Math.max(0, previous.volume * (1 - step / 6));
      if (step >= 6) {
        if (previous) { previous.pause(); previous.currentTime = 0; }
        if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, 90);
  }

  private playSfx(asset: AudioAssetDefinition): void {
    if (!this.unlocked || this.suspended || !this.preferences.enabled || !this.preferences.sfx || typeof Audio === 'undefined') return;
    this.stopSfx();
    const sfx = new Audio(asset.src);
    sfx.preload = 'auto';
    sfx.volume = this.targetVolume(asset);
    this.activeSfx = sfx;
    this.duckAmbience();
    const restore = () => { if (this.activeSfx === sfx) this.activeSfx = null; this.restoreAmbience(); };
    sfx.addEventListener('ended', restore, { once: true });
    sfx.addEventListener('error', restore, { once: true });
    safePlay(sfx);
  }

  private stopSfx(): void {
    if (!this.activeSfx) return;
    this.activeSfx.pause();
    this.activeSfx.currentTime = 0;
    this.activeSfx = null;
    this.restoreAmbience();
  }

  private duckAmbience(): void {
    if (!this.ambience || !this.ambienceKey) return;
    const target = this.targetVolume(AMBIENCE_AUDIO[this.ambienceKey]);
    this.ambience.volume = target * 0.58;
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.duckTimer = window.setTimeout(() => this.restoreAmbience(), 4500);
  }

  private restoreAmbience(): void {
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.duckTimer = null;
    if (!this.ambience || !this.ambienceKey || !this.canPlayAmbience()) return;
    this.ambience.volume = this.targetVolume(AMBIENCE_AUDIO[this.ambienceKey]);
  }
}

export const gameAudio = new EmberAudioRuntime();
export const unlockGameAudio = () => gameAudio.unlock();
export const stopGameAudio = () => gameAudio.stopAll();
