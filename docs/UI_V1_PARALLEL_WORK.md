# UI v1 parallel work split

This branch is the common dependency for three presentation branches:

- `feat/ui-v1-home-base`: home overview, resident rotation, six-building subpage.
- `feat/ui-v1-explore-night`: exploration selection / location / event flow and image-led night decisions.
- `feat/ui-v1-survivors-records`: named survivor progressive disclosure, street log, discovered places, unlocked character stories, memorial.

Integration rule: page branches should avoid editing `V060AppHotfix.tsx`, `V060NightScene.tsx`, or shared legacy CSS until the integration pass. New v1 components are added under `src/ui/v1/` so branches remain cherry-pickable and conflict-light.
