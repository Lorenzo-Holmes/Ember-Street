#!/usr/bin/env python3
"""Generate deterministic, sample-free low-density ambience for Ember Street."""

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
OUT = ROOT / "public" / "assets" / "audio" / "music"
RATE = 22050


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def envelope(time: float, duration: float, fade: float = 1.8) -> float:
    return min(smoothstep(time / fade), smoothstep((duration - time) / fade))


def transient(time: float, at: float, length: float, frequency: float, amp: float) -> float:
    local = time - at
    if local < 0 or local >= length:
        return 0.0
    env = math.exp(-5.0 * local / length)
    return math.sin(2 * math.pi * frequency * local) * amp * env


def generate(kind: str, duration: float) -> list[int]:
    samples: list[int] = []
    rng = random.Random({
        "day_shelter": 1101,
        "night_ambient": 1102,
        "horde_pressure": 1103,
        "expedition_pressure": 1104,
        "dawn_release": 1105,
    }[kind])
    filtered = 0.0
    phase_a = phase_b = phase_c = 0.0

    day_ticks = (5.5, 12.3, 19.6, 27.1)
    night_ticks = (8.8, 21.7, 29.4)
    horde_hits = (3.2, 7.5, 11.8, 16.4, 21.5, 25.7)
    expedition_steps = (4.1, 8.7, 13.5, 18.2, 22.4)

    for index in range(int(duration * RATE)):
        time = index / RATE
        progress = time / duration
        raw = rng.uniform(-1.0, 1.0)
        filtered += (raw - filtered) * 0.018
        value = 0.0

        if kind == "day_shelter":
            phase_a += 2 * math.pi * (54.5 + math.sin(time * .17) * .7) / RATE
            phase_b += 2 * math.pi * 82.0 / RATE
            value += math.sin(phase_a) * .075 + math.sin(phase_b) * .028
            value += filtered * .055
            for tick in day_ticks:
                value += transient(time, tick, .48, 360, .085)
                value += transient(time, tick + .08, .32, 142, .055)

        elif kind == "night_ambient":
            phase_a += 2 * math.pi * (41.5 + math.sin(time * .11) * .5) / RATE
            phase_b += 2 * math.pi * 62.0 / RATE
            value += math.sin(phase_a) * .064 + math.sin(phase_b) * .022
            value += filtered * .072
            for tick in night_ticks:
                value += transient(time, tick, 1.2, 196, .035)

        elif kind == "horde_pressure":
            pulse = .55 + .45 * max(0.0, math.sin(time * math.pi * .62))
            phase_a += 2 * math.pi * (38.0 + 7.0 * pulse) / RATE
            phase_b += 2 * math.pi * 71.0 / RATE
            value += math.sin(phase_a) * (.085 + .035 * pulse)
            value += math.sin(phase_b) * .026
            value += filtered * .088
            for hit in horde_hits:
                value += transient(time, hit, .75, 52, .15)
                value += transient(time, hit + .06, .35, 118, .065)

        elif kind == "expedition_pressure":
            phase_a += 2 * math.pi * 67.0 / RATE
            phase_b += 2 * math.pi * (101.0 + math.sin(time * .13)) / RATE
            value += math.sin(phase_a) * .055 + math.sin(phase_b) * .022
            value += filtered * .06
            for step in expedition_steps:
                value += transient(time, step, .32, 84, .075)

        elif kind == "dawn_release":
            brightness = smoothstep(progress)
            phase_a += 2 * math.pi * 110.0 / RATE
            phase_b += 2 * math.pi * 165.0 / RATE
            phase_c += 2 * math.pi * 220.0 / RATE
            value += math.sin(phase_a) * .045
            value += math.sin(phase_b) * (.018 + .017 * brightness)
            value += math.sin(phase_c) * (.006 + .014 * brightness)
            value += filtered * .025

        value *= envelope(time, duration)
        value = max(-.92, min(.92, value))
        samples.append(int(value * 32767))

    return samples


def write_wav(path: Path, samples: list[int]) -> None:
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))


def main() -> int:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required to encode MP3 ambience")
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {
        "day_shelter": 34.0,
        "night_ambient": 34.0,
        "horde_pressure": 28.0,
        "expedition_pressure": 26.0,
        "dawn_release": 22.0,
    }
    with tempfile.TemporaryDirectory(dir=ROOT) as temp:
        temp_dir = Path(temp)
        for kind, duration in specs.items():
            wav_path = temp_dir / f"bgm_{kind}.wav"
            mp3_path = OUT / f"bgm_{kind}.mp3"
            write_wav(wav_path, generate(kind, duration))
            subprocess.run([
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
                "-ac", "1", "-ar", str(RATE), "-b:a", "32k", "-map_metadata", "-1", str(mp3_path),
            ], check=True)
    print(f"Generated {len(specs)} deterministic ambience tracks in {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
