export interface FeedbackPreferences {
  sound: boolean;
  haptics: boolean;
}

const STORAGE_KEY = 'ember-street-feedback-v1';
let audioContext: AudioContext | null = null;

export function getFeedbackPreferences(): FeedbackPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FeedbackPreferences>;
      return { sound: parsed.sound !== false, haptics: parsed.haptics !== false };
    }
  } catch { /* storage is progressive enhancement */ }
  return { sound: true, haptics: true };
}

export function saveFeedbackPreferences(preferences: FeedbackPreferences): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* ignore */ }
}

function context(): AudioContext | null {
  if (audioContext && audioContext.state !== 'closed') return audioContext;
  try {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioContext = Ctor ? new Ctor() : null;
    return audioContext;
  } catch {
    return null;
  }
}

export function vibrate(ms = 8): void {
  if (!getFeedbackPreferences().haptics) return;
  navigator.vibrate?.(ms);
}

export function beep(frequency = 480, duration = 0.045): void {
  if (!getFeedbackPreferences().sound) return;
  const ctx = context();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.01);
  } catch { /* Web Audio is optional */ }
}
