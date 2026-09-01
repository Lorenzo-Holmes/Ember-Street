# Ember Street / 余烬长街 — Visual Style Bible

Status: **MASTER REFERENCE — LOCKED**

This document defines the visual language for all future illustration assets. Any future model or artist must treat the six Anchor Arts in `ANCHOR_SET.md` as the primary image references and this document as the written constraint layer.

## 1. Core visual thesis

Ember Street is a wartime civilian survival chronicle about ordinary people trying to survive one more day in a damaged city.

The visual center is not heroism. It is:

- exhaustion
- scarcity
- civilian mutual aid
- moral pressure
- dust and cold
- human vulnerability
- a very small amount of warmth that still survives

Every image should feel like it belongs to the same damaged field journal: charcoal, graphite, rough ink and weathered documentary illustration layered over a muted, dirty paper sensibility.

## 2. Non-negotiable exclusions

Never drift toward:

- anime, manga, JRPG portraits
- gacha or Korean mobile-game character rendering
- heroic fantasy or superhero posing
- military propaganda or tactical-operator aesthetics
- cyberpunk, neon, sci-fi HUD language
- glossy 3D, polished CGI surfaces
- Pixar / Disney stylization
- fashion editorial styling
- clean commercial concept art
- beautiful-apocalypse tourism
- blockbuster blue-orange grading

Characters are civilians, not operators. No body armor, plate carriers, tactical helmets, pristine military uniforms, assault-rifle hero poses, or fashion-apocalypse wardrobes unless a future game design explicitly introduces such an object.

## 3. Palette bible

Target: roughly **70–85% grayscale / near-neutral low saturation**.

Primary field:

- charcoal black
- concrete gray
- dust gray
- dirty beige
- weathered brown
- cold blue-gray

Accent colors must remain local and sparse:

- dark rust red: danger, blood, warning cloth
- dim tungsten yellow: bulbs, candles, stove fire, fragile hope
- faded institutional green: old medical equipment and municipal fixtures

No large saturated color masses.

At thumbnail size, the first read should be black / gray / brown / cold blue-gray.

## 4. Mark-making and material language

Required visual texture:

- rough graphite lines
- charcoal shadow blocks
- incomplete contour lines
- cross-hatching
- erased / rubbed graphite
- paper fibers
- slight ink bleed
- dirt and abrasion
- imperfect edge control

Digital polish must never erase the hand-made feel.

Skin should look human and slightly rough: pores implied through texture, fatigue, chapped lips, under-eye shadows, wrinkles where appropriate. Avoid plastic beauty rendering.

World materials should be dominated by:

- cracked concrete
- old plaster
- raw / splintered wood
- rusted metal
- chipped enamel
- patched fabric
- tape, wire, nails and scavenged fasteners
- cheap furniture repaired multiple times

## 5. Lighting bible

Overall key: low-key, overcast, constrained practical light.

Preferred light sources:

- cold cloudy window light
- old tungsten bulb
- candle
- stove / cooking fire
- flashlight
- pale dawn

Faces and important story objects must remain readable even when the frame is dark.

Avoid:

- neon spill
- lens flare
- glamorous rim light
- extreme volumetric god rays
- high-gloss blockbuster contrast

## 6. Camera bible

### Character art

- 2:3 portrait
- natural 35–70 mm portrait feel
- half-body to upper thigh
- 3/4 view preferred
- figure occupies about 65–75% of frame height
- hands visible whenever possible
- leave UI-safe breathing room around head, shoulders and lower torso
- no heroic low angles

### Location art

- landscape, preferably 3:2 or 16:9
- documentary observational height
- one strong subject
- two to four gameplay-relevant narrative details
- avoid wide-angle spectacle

### Event art

- landscape
- one decisive emotional instant, not the whole story
- stronger contrast than normal location art is allowed
- preserve a clean low-detail safe zone for UI title/body/choices
- tension should come from gesture, obstruction, proximity and light, not cinematic spectacle

### Building art

- landscape or compact module crop
- eye-level documentary or slightly elevated practical view
- clearly improvised, patched and repaired
- must feel buildable by civilians using scavenged materials

## 7. UI readability constraints

Illustration exists to improve recognition and emotional memory, not to compete with UI.

Every master asset must:

- retain readable silhouette at small card size
- keep faces large enough to identify
- avoid high-frequency clutter behind text-safe areas
- reserve 20–30% low-detail negative space where the intended UI layout needs it
- keep key objects away from crop-sensitive edges
- avoid pure-black crushed regions that destroy thumbnail readability

## 8. Character consistency rule

A core character must keep the same:

- skull / face proportions
- eye shape and spacing
- nose shape
- mouth shape
- hairline
- hair length and color
- body type and relative proportions
- garment architecture
- footwear
- habitual object(s)
- personal visual marker(s)

Injury/fatigue variants may add damage and change posture, but must not redesign the person.

## 9. Generation consistency protocol

1. Generate A01 first and approve identity + material language.
2. Generate A02 using A01 as a style/material reference, not as a face reference.
3. Generate A03/A04 using both approved character anchors as style references so line weight, paper texture and palette stay in the same world.
4. Generate A05 using the approved location anchor as environment reference. If a recognizable core character appears, also include that character anchor as identity reference.
5. Generate A06 using the full approved set as style references.
6. Never regenerate an approved anchor casually. An anchor revision is a versioned art-direction change.

## 10. Global negative prompt / rejection checklist

Reject any output that introduces:

- anime eyes or manga facial simplification
- beauty-retouched skin
- model-like posing
- clean designer clothing
- tactical operator gear
- futuristic devices
- neon
- glossy 3D materials
- photorealistic camera sharpness with no hand-drawn texture
- huge cinematic depth-of-field blur
- unnecessary weapons
- decorative rubble with no narrative function
- text, names, logos, subtitles, watermarks or UI

## 11. Master emotional test

A valid Ember Street image should make the viewer think:

> These are not heroes. They are people who have been trapped in a damaged city for weeks and are trying to survive another day.

Hope may exist, but it must be small, practical and earned.