from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys

from PIL import Image, ImageOps


if len(sys.argv) < 2:
    print("Usage: npm run build:building-assets -- <approved-source-directory>", file=sys.stderr)
    raise SystemExit(1)

root = Path.cwd()
source_dir = (root / sys.argv[1]).resolve()
output_dir = root / "public" / "assets" / "canonical"
tile_width = 480
tile_height = 320
columns = 3
extensions = (".png", ".jpg", ".jpeg", ".webp")

groups = (
    (
        "buildings-a.webp",
        tuple(f"A{i}" for i in range(30, 39)),
        "2cf279da70a23a56e5032d6263450da5bec1c6fd7095ea5ec2ca28a181f31df0",
    ),
    (
        "buildings-b.webp",
        tuple(f"A{i}" for i in range(39, 48)),
        "50c046ce115b9c09d24a5a502800f699f6f6b1be68f7b74d1a7619377f9f4648",
    ),
)


def find_source(canonical_id: str) -> Path:
    for extension in extensions:
        candidate = source_dir / f"{canonical_id}{extension}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Missing approved building master {canonical_id} in {source_dir}")


def make_tile(canonical_id: str) -> Image.Image:
    with Image.open(find_source(canonical_id)) as source:
        rgb = source.convert("RGB")
        return ImageOps.fit(
            rgb,
            (tile_width, tile_height),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        ).convert("RGBA")


if not source_dir.is_dir():
    raise FileNotFoundError(f"Approved source directory does not exist: {source_dir}")
output_dir.mkdir(parents=True, exist_ok=True)

temporary_outputs: list[tuple[Path, Path]] = []
try:
    for name, ids, expected_sha256 in groups:
        rows = (len(ids) + columns - 1) // columns
        sheet = Image.new(
            "RGBA",
            (columns * tile_width, rows * tile_height),
            (0, 0, 0, 0),
        )
        for index, canonical_id in enumerate(ids):
            sheet.paste(
                make_tile(canonical_id),
                ((index % columns) * tile_width, (index // columns) * tile_height),
            )

        destination = output_dir / name
        temporary = output_dir / f".{name}.tmp.webp"
        sheet.save(temporary, "WEBP", quality=82, method=6)
        payload = temporary.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        if digest != expected_sha256:
            raise RuntimeError(
                f"{name} does not match the frozen release hash. "
                f"Expected {expected_sha256}, got {digest}. Production files were not replaced."
            )
        temporary_outputs.append((temporary, destination))
        print(f"{name}: {', '.join(ids)} · {len(payload) / 1024:.1f} KiB · SHA-256 {digest}")

    for temporary, destination in temporary_outputs:
        os.replace(temporary, destination)
    print("Building sprites rebuilt byte-identically to the frozen A30-A47 release.")
except Exception:
    for temporary, _ in temporary_outputs:
        temporary.unlink(missing_ok=True)
    for name, _, _ in groups:
        (output_dir / f".{name}.tmp.webp").unlink(missing_ok=True)
    raise
