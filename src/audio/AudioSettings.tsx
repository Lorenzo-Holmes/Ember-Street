import { useEffect, useState } from 'react';
import { AUDIO_PREFERENCES_EVENT, loadAudioPreferences, saveAudioPreferences } from './audioPreferences';
import { gameAudio } from './audioRuntime';
import type { AudioPreferences, AudioVolumePreset } from './audioTypes';

const VOLUME_LABEL: Record<AudioVolumePreset, string> = { low: '低', medium: '中', high: '高' };

export default function AudioSettings() {
  const [preferences, setPreferences] = useState(loadAudioPreferences);

  useEffect(() => {
    const sync = (event: Event) => setPreferences((event as CustomEvent<AudioPreferences>).detail ?? loadAudioPreferences());
    window.addEventListener(AUDIO_PREFERENCES_EVENT, sync);
    return () => window.removeEventListener(AUDIO_PREFERENCES_EVENT, sync);
  }, []);

  const update = (patch: Partial<AudioPreferences>) => {
    const next = saveAudioPreferences({ ...preferences, ...patch });
    gameAudio.setPreferences(next);
    setPreferences(next);
  };

  return <section className="v1-audio-settings" aria-label="声音设置">
    <p>音乐保持在文字后面；事件音效只在事件真正出现时播放。</p>
    <button type="button" aria-pressed={preferences.enabled} onClick={() => update({ enabled: !preferences.enabled })}>
      <strong>声音总开关</strong><span>{preferences.enabled ? '开启' : '静音'}</span>
    </button>
    <button type="button" aria-pressed={preferences.ambience} disabled={!preferences.enabled} onClick={() => update({ ambience: !preferences.ambience })}>
      <strong>背景氛围</strong><span>{preferences.ambience ? '开启' : '关闭'}</span>
    </button>
    <button type="button" aria-pressed={preferences.sfx} disabled={!preferences.enabled} onClick={() => update({ sfx: !preferences.sfx })}>
      <strong>事件音效</strong><span>{preferences.sfx ? '开启' : '关闭'}</span>
    </button>
    <div className="v1-audio-settings__volume"><strong>整体音量</strong><div>
      {(['low', 'medium', 'high'] as AudioVolumePreset[]).map((volume) => <button type="button" key={volume}
        aria-pressed={preferences.volume === volume} disabled={!preferences.enabled} onClick={() => update({ volume })}>{VOLUME_LABEL[volume]}</button>)}
    </div></div>
    <small>声音偏好单独保存在本机，不写入游戏进度；音频不可用时仍可完整游玩。</small>
  </section>;
}
