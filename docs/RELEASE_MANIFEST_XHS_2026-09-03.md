# Ember Street / 余烬长街 — XHS Release Manifest

Generated: 2026-09-03

## Frozen source

- Repository: `Lorenzo-Holmes/Ember-Street`
- `main` merge commit: `9414855d15ac7c46c02b4b08b631406b9e70b8a9`
- Frozen release-candidate commit: `c21f2652c3e45832b598b85886dd04c08b6cbf87`
- Release PR: #23
- Legacy development PR #14: superseded/closed, not used for release

## Canonical art

- Approved production identifiers: A01–A29
- Runtime packaging: 7 local WebP sprite files
- Registry coverage: 29/29
- Unresolved identifiers: 0
- Non-locked identifiers: 0
- Runtime image payload reported by strict audit: 61.3 KiB

## Build identity

The frozen `main` Cloudflare deployment built:

- `assets/index-DU81tvf4.css`
- `assets/index-B3vyDD6z.js`

The reproducible Xiaohongshu submission workflow generated the same CSS/JS asset names, confirming the submission ZIP is built from the same runtime source as the deployed release.

## Automated verification

- TypeScript typecheck: PASS
- Unit/regression tests: 208 passed, 5 skipped
- Canonical visual strict audit: PASS
- Production build: PASS
- Xiaohongshu offline package audit: PASS
- Release-candidate 390×844 UI Smoke: PASS
- Cloudflare deploy: PASS

## Cloudflare deployment

- Worker: `ember-street`
- Worker deployment URL: `https://ember-street.1106314996.workers.dev`
- Cloudflare Version ID: `db49c56b-aeec-40e9-b4f0-032a2ffe918c`
- Custom project URL used by the project: `https://ember-street.lorenzoholmes.me/`

The current execution environment cannot resolve the public domain DNS, so production-page visual inspection must be completed from a normal browser/phone. GitHub Actions confirms that the exact frozen `main` build deployed successfully.

## Submission package

- Workflow artifact: `ember-street-xhs-20260903`
- Submission file: `ember-street-xhs-20260903.zip`
- ZIP size: 542,743 bytes
- SHA-256: `903a0bbfe657cc7f32a6adc8d6e3bbd13e97fdaf8fb48beb83fc23f3da1ed560`
- ZIP root: `index.html`, `assets/`
- No nested `dist/` directory

Use this SHA-256 to confirm that the file uploaded to Xiaohongshu is the tested submission artifact.
