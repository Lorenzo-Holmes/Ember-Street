"""Subset release-only fonts to the game's built-in characters, preserving OFL data."""
import json
import sys
import shutil
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
artifact = Path(sys.argv[1]).resolve()
if not artifact.is_relative_to(root / 'output' / 'releases'):
    raise SystemExit('Font output must be inside output/releases')

characters = set(chr(code) for code in range(32, 127))
for source in (root / 'src').rglob('*'):
    if source.suffix in {'.tsx', '.ts', '.css'}:
        characters.update(source.read_text(encoding='utf-8'))

results = []
previous_releases = sorted((root / 'output' / 'releases').glob('*/build-report.json'), reverse=True)
for index, path in enumerate(sorted(artifact.rglob('*.woff2'))):
    original = path.stat().st_size
    font = TTFont(path)
    required = {ord(char) for char in characters} & set(font.getBestCmap())
    reused = False
    for previous in previous_releases:
        candidate = previous.parent / 'app' / 'assets' / path.name
        if candidate == path or not candidate.exists() or candidate.stat().st_size >= original:
            continue
        cached = TTFont(candidate)
        covered = required.issubset(cached.getBestCmap())
        cached.close()
        if covered:
            font.close()
            shutil.copyfile(candidate, path)
            reused = True
            break
    if reused:
        results.append({'file': path.name, 'before': original, 'after': path.stat().st_size, 'reusedVerifiedSubset': True})
        continue
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=''.join(sorted(characters)))
    subsetter.subset(font)
    # A subset is a modified font; give it a project-specific internal family name.
    for record in font['name'].names:
        if record.nameID in {1, 2, 3, 4, 6, 16, 17}:
            label = 'Regular' if record.nameID in {2, 17} else f'EmberStreetSubset{index}'
            record.string = label.encode(record.getEncoding(), errors='replace')
    font.flavor = 'woff2'
    font.save(path)
    results.append({'file': path.name, 'before': original, 'after': path.stat().st_size})
print(json.dumps({'characters': len(characters), 'fonts': results}, ensure_ascii=False))
