import type { NightAudioKey } from '../game/v060/nightEvents';
import { AMBIENCE_AUDIO, NIGHT_AUDIO, UI_AUDIO } from './audioRegistry';
import { loadAudioPreferences } from './audioPreferences';
import type { AmbienceKey, AudioAssetDefinition, AudioPreferences, UiAudioCueKey } from './audioTypes';

const PLAYED_SESSION_KEY = 'ember-street-audio-played-v1';
const VOLUME_MULTIPLIER: Record<AudioPreferences['volume'], number> = { low: 0.55, medium: 0.78, high: 1 };
const INTERACTION_UI_CUES = new Set<UiAudioCueKey>(['page_turn', 'pen_circle', 'expedition_loot']);
const INTERACTION_COOLDOWN_MS: Partial<Record<UiAudioCueKey, number>> = {
  page_turn: 120,
  pen_circle: 120,
  expedition_loot: 180,
};
const EMBEDDED_SFX_CACHE_LIMIT = 8;

type EmbeddedAudioWindow = Window & typeof globalThis & {
  __EMBER_AUDIO_DATA__?: Record<string, string>;
  webkitAudioContext?: typeof AudioContext;
};

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

export function embeddedAudioKeyForAsset(src: string): string {
  if (src.startsWith('embedded:')) return src;
  const normalized = src.replace(/^\.\//, '/');
  const match = normalized.match(/^\/assets\/audio\/(music|sfx)\/([^/]+)\.mp3$/);
  return match ? `embedded:${match[1]}/${match[2]}` : src;
}

function embeddedAudioData(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  const data = (window as EmbeddedAudioWindow).__EMBER_AUDIO_DATA__;
  return data && Object.keys(data).length ? data : null;
}

function embeddedAudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const host = window as EmbeddedAudioWindow;
  return host.AudioContext ?? host.webkitAudioContext ?? null;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

class EmberAudioRuntime {
  private unlocked = false;
  private suspended = false;
  private preferences = loadAudioPreferences();
  private ambienceKey: AmbienceKey | null = null;

  // Standard web backend: packaged MP3 files + HTMLAudioElement.
  private ambience: HTMLAudioElement | null = null;
  private activeSfx: HTMLAudioElement | null = null;
  private interactionSfx = new Set<HTMLAudioElement>();

  // Xiaohongshu mini-tool backend: base64 strings in JS + Web Audio decodeAudioData.
  private embeddedContext: AudioContext | null = null;
  private embeddedAmbienceSource: AudioBufferSourceNode | null = null;
  private embeddedAmbienceGain: GainNode | null = null;
  private embeddedAmbienceBuffer: AudioBuffer | null = null;
  private embeddedAmbienceBufferKey: string | null = null;
  private embeddedAmbienceRevision = 0;
  private embeddedActiveSfx: AudioBufferSourceNode | null = null;
  private embeddedInteractionSfx = new Set<AudioBufferSourceNode>();
  private embeddedSfxBuffers = new Map<string, AudioBuffer>();
  private embeddedPendingBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private embeddedSfxRevision = 0;

  private interactionLastPlayed = new Map<UiAudioCueKey, number>();
  private fadeTimer: number | null = null;
  private duckTimer: number | null = null;

  unlock(): void {
    this.unlocked = true;
    if (!this.preferences.enabled) return;
    if (this.useEmbeddedAudio()) {
      const context = this.ensureEmbeddedContext();
      if (!context) return;
      const resumed = context.resume();
      if (resumed && typeof resumed.then === 'function') resumed.then(() => this.refreshAmbience()).catch(() => undefined);
      else this.refreshAmbience();
      return;
    }
    if (typeof Audio === 'undefined') return;
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
    if (!next.enabled || !next.sfx) {
      this.stopSfx();
      this.stopInteractionSfx();
      this.stopEmbeddedSfx();
      this.stopEmbeddedInteractionSfx();
    }
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (this.useEmbeddedAudio()) {
      const context = this.embeddedContext;
      if (!context) return;
      const transition = suspended ? context.suspend() : context.resume();
      if (!suspended && transition && typeof transition.then === 'function') transition.then(() => this.refreshAmbience()).catch(() => undefined);
      return;
    }
    if (suspended) this.pauseAmbience();
    else this.refreshAmbience();
  }

  setAmbience(key: AmbienceKey): void {
    if (this.ambienceKey === key) { this.refreshAmbience(); return; }
    this.ambienceKey = key;
    if (!this.canPlayAmbience()) return;
    if (this.useEmbeddedAudio()) this.crossfadeEmbeddedTo(key);
    else this.crossfadeTo(key);
  }

  playNightCue(key: NightAudioKey, instanceKey: string, delayMs = 120): void {
    const cueKey = `night:${instanceKey}`;
    if (sessionPlayed().has(cueKey)) return;
    rememberSessionCue(cueKey);
    window.setTimeout(() => this.playSfx(NIGHT_AUDIO[key]), delayMs);
  }

  playUiCue(key: UiAudioCueKey, delayMs = 0): void {
    window.setTimeout(() => {
      if (INTERACTION_UI_CUES.has(key)) this.playInteractionSfx(UI_AUDIO[key], key);
      else this.playSfx(UI_AUDIO[key]);
    }, delayMs);
  }

  stopAll(): void {
    this.ambienceKey = null;
    this.stopSfx();
    this.stopInteractionSfx();
    this.stopEmbeddedSfx();
    this.stopEmbeddedInteractionSfx();
    this.stopEmbeddedAmbience();
    if (this.ambience) { this.ambience.pause(); this.ambience = null; }
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.fadeTimer = null;
    this.duckTimer = null;
    this.embeddedAmbienceBuffer = null;
    this.embeddedAmbienceBufferKey = null;
    this.embeddedSfxBuffers.clear();
    this.embeddedPendingBuffers.clear();
    if (this.embeddedContext) {
      const context = this.embeddedContext;
      this.embeddedContext = null;
      const closed = context.close();
      if (closed && typeof closed.catch === 'function') closed.catch(() => undefined);
    }
  }

  private useEmbeddedAudio(): boolean {
    return Boolean(embeddedAudioData());
  }

  private ensureEmbeddedContext(): AudioContext | null {
    if (this.embeddedContext && this.embeddedContext.state !== 'closed') return this.embeddedContext;
    const AudioContextClass = embeddedAudioCtor();
    if (!AudioContextClass) return null;
    try {
      this.embeddedContext = new AudioContextClass();
      return this.embeddedContext;
    } catch { return null; }
  }

  private canPlayAmbience(): boolean {
    if (!this.unlocked || this.suspended || !this.preferences.enabled || !this.preferences.ambience) return false;
    return this.useEmbeddedAudio() ? Boolean(embeddedAudioCtor()) : typeof Audio !== 'undefined';
  }

  private targetVolume(asset: AudioAssetDefinition): number {
    return Math.max(0, Math.min(1, asset.volume * VOLUME_MULTIPLIER[this.preferences.volume]));
  }

  private refreshAmbience(): void {
    if (!this.ambienceKey || !this.canPlayAmbience()) return;
    if (this.useEmbeddedAudio()) {
      const asset = AMBIENCE_AUDIO[this.ambienceKey];
      if (!this.embeddedAmbienceSource) { this.crossfadeEmbeddedTo(this.ambienceKey); return; }
      if (this.embeddedAmbienceGain) this.embeddedAmbienceGain.gain.value = this.targetVolume(asset);
      return;
    }
    if (!this.ambience) { this.crossfadeTo(this.ambienceKey); return; }
    const asset = AMBIENCE_AUDIO[this.ambienceKey];
    this.ambience.volume = this.targetVolume(asset);
    safePlay(this.ambience);
  }

  private pauseAmbience(): void {
    if (this.useEmbeddedAudio()) this.stopEmbeddedAmbience();
    else this.ambience?.pause();
  }

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

  private crossfadeEmbeddedTo(key: AmbienceKey): void {
    const context = this.ensureEmbeddedContext();
    if (!context) return;
    const asset = AMBIENCE_AUDIO[key];
    const assetKey = embeddedAudioKeyForAsset(asset.src);
    const revision = ++this.embeddedAmbienceRevision;
    const reuse = this.embeddedAmbienceBufferKey === assetKey ? Promise.resolve(this.embeddedAmbienceBuffer) : this.decodeEmbeddedAsset(asset.src, false);
    reuse.then((buffer) => {
      if (!buffer || revision !== this.embeddedAmbienceRevision || this.ambienceKey !== key || !this.canPlayAmbience()) return;
      const currentContext = this.ensureEmbeddedContext();
      if (!currentContext) return;
      const source = currentContext.createBufferSource();
      const gain = currentContext.createGain();
      const target = this.targetVolume(asset);
      source.buffer = buffer;
      source.loop = asset.loop === true;
      gain.gain.setValueAtTime(0, currentContext.currentTime);
      gain.gain.linearRampToValueAtTime(target, currentContext.currentTime + 0.54);
      source.connect(gain);
      gain.connect(currentContext.destination);
      const previousSource = this.embeddedAmbienceSource;
      const previousGain = this.embeddedAmbienceGain;
      if (previousGain) {
        previousGain.gain.cancelScheduledValues(currentContext.currentTime);
        previousGain.gain.setValueAtTime(previousGain.gain.value, currentContext.currentTime);
        previousGain.gain.linearRampToValueAtTime(0, currentContext.currentTime + 0.54);
      }
      if (previousSource) {
        try { previousSource.stop(currentContext.currentTime + 0.56); } catch { /* already stopped */ }
      }
      this.embeddedAmbienceSource = source;
      this.embeddedAmbienceGain = gain;
      this.embeddedAmbienceBuffer = buffer;
      this.embeddedAmbienceBufferKey = assetKey;
      source.onended = () => {
        if (this.embeddedAmbienceSource === source) {
          this.embeddedAmbienceSource = null;
          this.embeddedAmbienceGain = null;
        }
        try { source.disconnect(); gain.disconnect(); } catch { /* best effort */ }
      };
      try { source.start(); } catch { /* decode/playback failure is presentation-only */ }
    }).catch(() => undefined);
  }

  private stopEmbeddedAmbience(): void {
    this.embeddedAmbienceRevision += 1;
    const source = this.embeddedAmbienceSource;
    this.embeddedAmbienceSource = null;
    this.embeddedAmbienceGain = null;
    if (!source) return;
    source.onended = null;
    try { source.stop(); source.disconnect(); } catch { /* already stopped */ }
  }

  private decodeEmbeddedAsset(src: string, cacheSfx: boolean): Promise<AudioBuffer | null> {
    const key = embeddedAudioKeyForAsset(src);
    if (cacheSfx) {
      const cached = this.embeddedSfxBuffers.get(key);
      if (cached) {
        this.embeddedSfxBuffers.delete(key);
        this.embeddedSfxBuffers.set(key, cached);
        return Promise.resolve(cached);
      }
    }
    const pending = this.embeddedPendingBuffers.get(key);
    if (pending) return pending;
    const encoded = embeddedAudioData()?.[key];
    const context = this.ensureEmbeddedContext();
    if (!encoded || !context) return Promise.resolve(null);
    const promise = new Promise<AudioBuffer | null>((resolve) => {
      let bytes: ArrayBuffer;
      try { bytes = base64ToArrayBuffer(encoded); }
      catch { resolve(null); return; }
      let settled = false;
      const complete = (buffer: AudioBuffer | null) => {
        if (settled) return;
        settled = true;
        resolve(buffer);
      };
      try {
        const result = context.decodeAudioData(bytes, (buffer) => complete(buffer), () => complete(null));
        if (result && typeof result.then === 'function') result.then((buffer) => complete(buffer)).catch(() => complete(null));
      } catch { complete(null); }
    }).then((buffer) => {
      this.embeddedPendingBuffers.delete(key);
      if (buffer && cacheSfx) {
        this.embeddedSfxBuffers.set(key, buffer);
        while (this.embeddedSfxBuffers.size > EMBEDDED_SFX_CACHE_LIMIT) {
          const oldest = this.embeddedSfxBuffers.keys().next().value as string | undefined;
          if (!oldest) break;
          this.embeddedSfxBuffers.delete(oldest);
        }
      }
      return buffer;
    });
    this.embeddedPendingBuffers.set(key, promise);
    return promise;
  }

  private playSfx(asset: AudioAssetDefinition): void {
    if (this.useEmbeddedAudio()) { this.playEmbeddedSfx(asset); return; }
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

  private playEmbeddedSfx(asset: AudioAssetDefinition): void {
    if (!this.unlocked || this.suspended || !this.preferences.enabled || !this.preferences.sfx) return;
    const revision = ++this.embeddedSfxRevision;
    this.stopEmbeddedSfx(false);
    this.decodeEmbeddedAsset(asset.src, true).then((buffer) => {
      if (!buffer || revision !== this.embeddedSfxRevision || this.suspended || !this.preferences.enabled || !this.preferences.sfx) return;
      const context = this.ensureEmbeddedContext();
      if (!context) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = this.targetVolume(asset);
      source.connect(gain);
      gain.connect(context.destination);
      this.embeddedActiveSfx = source;
      this.duckAmbience();
      source.onended = () => {
        if (this.embeddedActiveSfx === source) this.embeddedActiveSfx = null;
        try { source.disconnect(); gain.disconnect(); } catch { /* best effort */ }
        this.restoreAmbience();
      };
      try { source.start(); } catch { this.restoreAmbience(); }
    }).catch(() => undefined);
  }

  private playInteractionSfx(asset: AudioAssetDefinition, key: UiAudioCueKey): void {
    if (this.useEmbeddedAudio()) { this.playEmbeddedInteractionSfx(asset, key); return; }
    if (!this.unlocked || this.suspended || !this.preferences.enabled || !this.preferences.sfx || typeof Audio === 'undefined') return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cooldown = INTERACTION_COOLDOWN_MS[key] ?? 80;
    const last = this.interactionLastPlayed.get(key) ?? -Infinity;
    if (now - last < cooldown) return;
    this.interactionLastPlayed.set(key, now);
    const sfx = new Audio(asset.src);
    sfx.preload = 'auto';
    sfx.volume = this.targetVolume(asset);
    this.interactionSfx.add(sfx);
    const release = () => this.interactionSfx.delete(sfx);
    sfx.addEventListener('ended', release, { once: true });
    sfx.addEventListener('error', release, { once: true });
    safePlay(sfx);
  }

  private playEmbeddedInteractionSfx(asset: AudioAssetDefinition, key: UiAudioCueKey): void {
    if (!this.unlocked || this.suspended || !this.preferences.enabled || !this.preferences.sfx) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cooldown = INTERACTION_COOLDOWN_MS[key] ?? 80;
    const last = this.interactionLastPlayed.get(key) ?? -Infinity;
    if (now - last < cooldown) return;
    this.interactionLastPlayed.set(key, now);
    this.decodeEmbeddedAsset(asset.src, true).then((buffer) => {
      if (!buffer || this.suspended || !this.preferences.enabled || !this.preferences.sfx) return;
      const context = this.ensureEmbeddedContext();
      if (!context) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = this.targetVolume(asset);
      source.connect(gain);
      gain.connect(context.destination);
      this.embeddedInteractionSfx.add(source);
      source.onended = () => {
        this.embeddedInteractionSfx.delete(source);
        try { source.disconnect(); gain.disconnect(); } catch { /* best effort */ }
      };
      try { source.start(); } catch { this.embeddedInteractionSfx.delete(source); }
    }).catch(() => undefined);
  }

  private stopSfx(): void {
    if (!this.activeSfx) return;
    this.activeSfx.pause();
    this.activeSfx.currentTime = 0;
    this.activeSfx = null;
    this.restoreAmbience();
  }

  private stopInteractionSfx(): void {
    for (const sfx of this.interactionSfx) {
      sfx.pause();
      sfx.currentTime = 0;
    }
    this.interactionSfx.clear();
  }

  private stopEmbeddedSfx(incrementRevision = true): void {
    if (incrementRevision) this.embeddedSfxRevision += 1;
    const source = this.embeddedActiveSfx;
    this.embeddedActiveSfx = null;
    if (!source) return;
    source.onended = null;
    try { source.stop(); source.disconnect(); } catch { /* already stopped */ }
    this.restoreAmbience();
  }

  private stopEmbeddedInteractionSfx(): void {
    for (const source of this.embeddedInteractionSfx) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch { /* already stopped */ }
    }
    this.embeddedInteractionSfx.clear();
  }

  private duckAmbience(): void {
    if (!this.ambienceKey) return;
    const target = this.targetVolume(AMBIENCE_AUDIO[this.ambienceKey]);
    if (this.useEmbeddedAudio()) {
      if (!this.embeddedAmbienceGain) return;
      this.embeddedAmbienceGain.gain.value = target * 0.58;
    } else {
      if (!this.ambience) return;
      this.ambience.volume = target * 0.58;
    }
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.duckTimer = window.setTimeout(() => this.restoreAmbience(), 4500);
  }

  private restoreAmbience(): void {
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.duckTimer = null;
    if (!this.ambienceKey || !this.canPlayAmbience()) return;
    const target = this.targetVolume(AMBIENCE_AUDIO[this.ambienceKey]);
    if (this.useEmbeddedAudio()) {
      if (this.embeddedAmbienceGain) this.embeddedAmbienceGain.gain.value = target;
      return;
    }
    if (this.ambience) this.ambience.volume = target;
  }
}

export const gameAudio = new EmberAudioRuntime();
export const unlockGameAudio = () => gameAudio.unlock();
export const stopGameAudio = () => gameAudio.stopAll();
