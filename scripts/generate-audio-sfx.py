#!/usr/bin/env python3
"""Generate deterministic, sample-free Ember Street event SFX."""

from __future__ import annotations

import math
import random
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "audio" / "sfx"
RATE = 32000


def blank(seconds: float) -> list[float]:
    return [0.0] * int(seconds * RATE)


def add_tone(buf: list[float], start: float, duration: float, f0: float, f1: float | None = None,
             amp: float = 0.2, decay: float = 1.8) -> None:
    begin = int(start * RATE)
    count = min(int(duration * RATE), len(buf) - begin)
    if count <= 0:
        return
    f1 = f0 if f1 is None else f1
    phase = 0.0
    for index in range(count):
        progress = index / max(1, count - 1)
        frequency = f0 + (f1 - f0) * progress
        phase += 2 * math.pi * frequency / RATE
        env = math.exp(-decay * progress)
        buf[begin + index] += math.sin(phase) * amp * env


def add_noise(buf: list[float], start: float, duration: float, amp: float, seed: int,
              smooth: float = 0.12, decay: float = 0.4) -> None:
    begin = int(start * RATE)
    count = min(int(duration * RATE), len(buf) - begin)
    rng = random.Random(seed)
    filtered = 0.0
    for index in range(max(0, count)):
        raw = rng.uniform(-1, 1)
        filtered += (raw - filtered) * smooth
        progress = index / max(1, count - 1)
        env = math.exp(-decay * progress)
        buf[begin + index] += filtered * amp * env


def impact(buf: list[float], at: float, amp: float = 0.65, pitch: float = 92, seed: int = 1) -> None:
    add_tone(buf, at, 0.42, pitch, pitch * 0.55, amp=amp, decay=5.5)
    add_tone(buf, at, 0.28, pitch * 2.4, pitch * 1.1, amp=amp * 0.22, decay=7.0)
    add_noise(buf, at, 0.18, amp=amp * 0.42, seed=seed, smooth=0.34, decay=6.0)


def click(buf: list[float], at: float, amp: float = 0.42, seed: int = 1) -> None:
    add_noise(buf, at, 0.065, amp=amp, seed=seed, smooth=0.58, decay=10.0)
    add_tone(buf, at, 0.08, 820, 430, amp=amp * 0.22, decay=9.0)


def make(name: str, duration: float) -> list[float]:
    buf = blank(duration)
    if name == "sfx_medical_care":
        add_noise(buf, .2, 2.7, .12, 31, .08, .5); click(buf, .95, .2, 32); click(buf, 2.05, .16, 33)
    elif name == "sfx_injured_return":
        for i, t in enumerate((.32, .82, 1.38, 2.02)): impact(buf, t, .22 - i * .018, 78, 40 + i)
        add_tone(buf, 2.25, 1.55, 150, 58, .16, 1.0); impact(buf, 3.55, .38, 74, 48)
    elif name == "sfx_conflict_murmur":
        add_noise(buf, 0, 3.6, .07, 51, .025, .15)
        for i, (t, f) in enumerate(((.25, 124), (.7, 171), (1.2, 138), (1.7, 184), (2.2, 116), (2.75, 161))):
            add_tone(buf, t, .65, f, f * .92, .085, 1.1 + i * .05)
    elif name == "sfx_distant_threat":
        add_noise(buf, 0, 4.5, .035, 61, .018, .05)
        for i, t in enumerate((.65, 2.0, 3.55)): impact(buf, t, .30, 54 + i * 5, 62 + i)
    elif name == "sfx_horde_impact":
        add_noise(buf, 0, 4.6, .06, 71, .025, .04)
        for i, t in enumerate((.42, 1.16, 1.92, 2.8, 3.65)): impact(buf, t, .48 if i < 3 else .38, 50 + i * 3, 72 + i)
        add_tone(buf, 1.5, 2.7, 76, 43, .13, .7)
    elif name == "sfx_empty_space":
        add_noise(buf, 0, 3.8, .025, 81, .025, .03); add_noise(buf, 1.35, .55, .08, 82, .09, 1.8)
    elif name == "sfx_storage_rustle":
        add_noise(buf, .2, 2.7, .14, 91, .12, .35)
        for i, t in enumerate((.5, 1.05, 1.82, 2.62)): click(buf, t, .16, 92 + i)
    elif name == "sfx_quiet_room":
        add_tone(buf, 0, 3.9, 72, 70, .035, .1); add_noise(buf, 0, 4, .02, 101, .03, .02); click(buf, 2.25, .13, 102)
    elif name == "sfx_package_drop":
        impact(buf, .55, .48, 68, 111)
        for i, t in enumerate((1.55, 2.12, 2.78)): impact(buf, t, .13 - i * .02, 82, 112 + i)
    elif name == "sfx_departure_steps":
        impact(buf, .35, .30, 96, 121)
        for i, t in enumerate((1.2, 1.8, 2.45, 3.15, 3.9)): impact(buf, t, .21 * (1 - i * .13), 73, 122 + i)
    elif name == "sfx_power_failure":
        add_tone(buf, .0, 1.9, 82, 47, .18, 1.15)
        add_tone(buf, .0, 1.55, 118, 61, .08, 1.35)
        click(buf, .72, .34, 126)
        click(buf, 1.24, .25, 127)
        add_noise(buf, 1.0, 2.8, .085, 128, .08, .85)
        add_tone(buf, 2.05, 1.6, 54, 35, .08, 1.8)
    elif name == "sfx_radio_static":
        add_noise(buf, 0, 3.7, .17, 131, .22, .05); add_tone(buf, .55, .32, 1040, 1020, .055, .4); add_tone(buf, 2.35, .38, 880, 910, .05, .4)
    elif name == "sfx_radio_burst":
        add_noise(buf, 0, 3.8, .16, 141, .25, .04)
        for t, f in ((.55, 720), (.78, 860), (1.35, 680), (1.58, 920), (2.4, 760), (2.68, 840)): add_tone(buf, t, .16, f, f, .10, 1.0)
    elif name == "sfx_structure_creak":
        add_tone(buf, .2, 3.75, 142, 44, .23, .7); add_tone(buf, .75, 2.8, 215, 82, .08, 1.0); add_noise(buf, .4, 3.2, .06, 151, .035, .15)
    elif name == "sfx_fire_hiss":
        add_noise(buf, 0, 4.0, .18, 161, .5, .03)
        for t in (.9, 1.85, 3.0): click(buf, t, .08, 162 + int(t * 10))
    elif name == "sfx_alarm":
        for i in range(8):
            t = .25 + i * .44; add_tone(buf, t, .20, 1010 if i % 2 == 0 else 880, amp=.14, decay=.4)
    elif name == "sfx_dusk_lock":
        impact(buf, .35, .50, 105, 181); click(buf, 1.1, .34, 182); impact(buf, 1.55, .25, 72, 183)
    elif name == "sfx_dice_roll":
        for i, t in enumerate((.18, .28, .39, .51, .69, .82, 1.02, 1.22)): click(buf, t, .24 if i < 5 else .15, 190 + i)
    elif name == "sfx_journal_mark":
        for i in range(18):
            add_noise(buf, .18 + i * .075, .06, .075, 210 + i, .55, 2.5)
    else:
        raise ValueError(name)
    return buf


def write_wav(path: Path, samples: list[float]) -> None:
    peak = max(1e-6, max(abs(value) for value in samples))
    scale = min(1.0, .92 / peak)
    pcm = bytearray()
    for value in samples:
        pcm += struct.pack('<h', int(max(-1, min(1, value * scale)) * 32767))
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(RATE); stream.writeframes(pcm)


def main() -> int:
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('ffmpeg is required to encode MP3 SFX')
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {
        'sfx_medical_care': 3.1, 'sfx_injured_return': 4.2,
        'sfx_conflict_murmur': 3.8, 'sfx_distant_threat': 4.5, 'sfx_horde_impact': 4.6,
        'sfx_empty_space': 3.8, 'sfx_storage_rustle': 3.2, 'sfx_quiet_room': 4.0,
        'sfx_package_drop': 4.0, 'sfx_departure_steps': 4.8,
        'sfx_radio_static': 3.7,
        'sfx_radio_burst': 3.8, 'sfx_structure_creak': 4.2, 'sfx_fire_hiss': 4.0,
        'sfx_alarm': 3.9, 'sfx_dusk_lock': 2.4,
        'sfx_dice_roll': 1.8, 'sfx_journal_mark': 1.9,
    }
    with tempfile.TemporaryDirectory(dir=ROOT) as temp:
        temp_dir = Path(temp)
        for name, duration in specs.items():
            wav_path = temp_dir / f'{name}.wav'
            mp3_path = OUT / f'{name}.mp3'
            write_wav(wav_path, make(name, duration))
            subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path),
                            '-ac', '1', '-ar', str(RATE), '-b:a', '48k', '-map_metadata', '-1', str(mp3_path)], check=True)
    print(f'Generated {len(specs)} deterministic SFX in {OUT} (reviewed power-failure and imported Mixkit V2 SFX are preserved)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
