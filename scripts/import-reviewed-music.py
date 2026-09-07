#!/usr/bin/env python3
"""Import locally reviewed music masters from ./music into runtime-sized MP3 assets.

The source filenames may contain non-ASCII characters. To avoid locale-dependent
filename handling, masters are matched by their known durations instead.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "music"
MUSIC_OUT = ROOT / "public" / "assets" / "audio" / "music"
SFX_OUT = ROOT / "public" / "assets" / "audio" / "sfx"


SPECS = [
    # target, expected source duration, start, clip duration, channels, bitrate, loudness, mode
    (MUSIC_OUT / "bgm_day_shelter.mp3", 365.832, 32.0, 72.0, 2, "64k", -20, "loop"),
    (MUSIC_OUT / "bgm_night_ambient.mp3", 166.512, 34.0, 72.0, 2, "64k", -21, "loop"),
    (MUSIC_OUT / "bgm_horde_pressure.mp3", 112.440, 18.0, 58.0, 2, "64k", -19, "loop-horde"),
    (MUSIC_OUT / "bgm_expedition_pressure.mp3", 231.744, 48.0, 55.0, 2, "64k", -20, "loop"),
    (MUSIC_OUT / "bgm_dawn_release.mp3", 105.552, 24.0, 34.0, 2, "64k", -20, "oneshot"),
    (SFX_OUT / "sfx_power_failure.mp3", 147.408, 31.0, 8.0, 1, "48k", -18, "stinger"),
]


def ffprobe_duration(ffprobe: str, path: Path) -> float:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def main() -> int:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe are required")
    if not SOURCE.is_dir():
        raise SystemExit(f"Missing reviewed master directory: {SOURCE}")

    candidates = []
    for path in SOURCE.glob("*.mp3"):
        candidates.append((path, ffprobe_duration(ffprobe, path)))
    if len(candidates) < 6:
        raise SystemExit(f"Expected at least 6 MP3 masters in {SOURCE}, found {len(candidates)}")

    used: set[Path] = set()
    for target, expected, start, duration, channels, bitrate, loudness, mode in SPECS:
        matches = sorted(
            ((abs(actual - expected), path, actual) for path, actual in candidates if path not in used),
            key=lambda item: item[0],
        )
        if not matches or matches[0][0] > 0.35:
            raise SystemExit(f"Could not find reviewed source around {expected:.3f}s for {target.name}")
        _, source, actual = matches[0]
        used.add(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        loop_crossfade = 2.0
        if mode in {"loop", "loop-horde"}:
            # Build the seam into the file itself: keep the middle, crossfade the source
            # tail into its head, then concatenate. The rendered file therefore ends at
            # the same musical point where it begins instead of relying on a hard HTML
            # loop boundary.
            pre = (
                "acompressor=threshold=-24dB:ratio=2:attack=20:release=250:makeup=1.5,"
                if mode == "loop-horde" else ""
            )
            normalized = f"{pre}loudnorm=I={loudness}:LRA=7:TP=-2.5"
            middle_start = loop_crossfade
            middle_end = duration - loop_crossfade
            tail_start = duration - loop_crossfade
            audio_filter = (
                f"[0:a]{normalized},asplit=3[a][b][c];"
                f"[a]atrim=start={middle_start:.3f}:end={middle_end:.3f},asetpts=PTS-STARTPTS[mid];"
                f"[b]atrim=start={tail_start:.3f}:end={duration:.3f},asetpts=PTS-STARTPTS[tail];"
                f"[c]atrim=start=0:end={loop_crossfade:.3f},asetpts=PTS-STARTPTS[head];"
                f"[tail][head]acrossfade=d={loop_crossfade:.3f}:c1=tri:c2=tri[seam];"
                "[mid][seam]concat=n=2:v=0:a=1[out]"
            )
        elif mode == "stinger":
            fade_out = max(0.0, duration - 0.35)
            audio_filter = (
                f"loudnorm=I={loudness}:LRA=7:TP=-2.5,"
                f"afade=t=in:st=0:d=0.08,afade=t=out:st={fade_out:.3f}:d=0.35"
            )
        else:
            fade_out = max(0.0, duration - 1.2)
            audio_filter = (
                f"loudnorm=I={loudness}:LRA=7:TP=-2.5,"
                f"afade=t=in:st=0:d=0.7,afade=t=out:st={fade_out:.3f}:d=1.2"
            )
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(start), "-i", str(source), "-t", str(duration),
            "-vn", "-map_metadata", "-1", "-ac", str(channels), "-ar", "44100",
        ]
        if mode in {"loop", "loop-horde"}:
            command += ["-filter_complex", audio_filter, "-map", "[out]"]
        else:
            command += ["-af", audio_filter]
        command += ["-b:a", bitrate, str(target)]
        subprocess.run(command, check=True)
        print(f"{target.relative_to(ROOT)} <= {source.name} ({actual:.3f}s)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
