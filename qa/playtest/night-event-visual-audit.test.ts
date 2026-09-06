import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../../src/game/v060/nightEventsExpansion';
import type { GameState } from '../../src/game/types';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { FINAL_HORDE_EVENTS } from '../../src/game/v060/finalHorde';
import { lowHopeDepartureFlag, medicalCrisisFlag } from '../../src/game/v060/mortality';
import { mortalityEventById } from '../../src/game/v060/mortalityEvents';
import { ALL_V060_NIGHT_EVENTS, type NightVisualKey, type V060NightEvent } from '../../src/game/v060/nightEvents';
import { NIGHT_VISUAL_DEFINITIONS, nightVisual, visualAssetSource } from '../../src/ui/visualAssets';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;
const staticEvents = [...ALL_V060_NIGHT_EVENTS, ...FINAL_HORDE_EVENTS];

function templateEvents(): V060NightEvent[] {
  const base = { ...createV060InitialState(78300), day: 12 };
  const medicalState: GameState = {
    ...base,
    survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia'
      ? { ...survivor, condition: 'critical', untreatedDays: 2 }
      : survivor),
    storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
  };
  const departureState: GameState = {
    ...base,
    storyFlags: [...base.storyFlags, lowHopeDepartureFlag('zhou')],
  };
  return [
    mortalityEventById(medicalState, 'mortality-medical:lin-xia')!,
    mortalityEventById(departureState, 'mortality-hope:zhou')!,
  ];
}

describe('night event visual audit artifact', () => {
  auditIt('writes all static events and dynamic templates with triggers, choices, results and image mappings', () => {
    const dynamicEvents = templateEvents();
    const allEvents = [...staticEvents, ...dynamicEvents];
    const displayId = (event: V060NightEvent) => event.id.startsWith('mortality-medical:')
      ? 'mortality-medical:<survivorId>'
      : event.id.startsWith('mortality-hope:') ? 'mortality-hope:<survivorId>' : event.id;
    const sharedByKey = new Map<NightVisualKey, string[]>();
    for (const event of allEvents) {
      sharedByKey.set(event.visualKey, [...(sharedByKey.get(event.visualKey) ?? []), displayId(event)]);
    }

    const rows = allEvents.map((event) => {
      const id = displayId(event);
      const asset = nightVisual(event.visualKey)!;
      return {
        id,
        title: event.title,
        eventText: event.body,
        trigger: {
          day: { min: event.minDay, max: event.maxDay },
          requiredSurvivorIds: event.requiredSurvivorIds ?? [],
          requiredBuildings: event.requiredBuildings ?? {},
          requiredFlags: event.requiredFlags ?? [],
          excludedFlags: event.excludedFlags ?? [],
          dynamicTemplate: id.includes('<survivorId>') ? id : null,
        },
        choices: event.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          text: choice.detail,
          strategy: choice.strategy,
          cost: choice.cost ?? null,
          check: choice.check ?? null,
          directResult: choice.direct ?? null,
          checkedResults: choice.outcomes ?? null,
        })),
        previousIllustration: {
          canonicalId: 'A06',
          path: '/assets/canonical/places-a.webp',
          sharedByNearlyAllNightEvents: true,
          reason: 'The old UI queried canonical art by night event id; unmatched ids fell back to the shelter overview.',
        },
        recommendedVisualCategory: event.visualKey,
        currentIllustration: {
          canonicalId: asset.canonicalId,
          path: visualAssetSource(asset),
          playerLabel: NIGHT_VISUAL_DEFINITIONS[event.visualKey].label,
          sharedWith: (sharedByKey.get(event.visualKey) ?? []).filter((other) => other !== id),
        },
      };
    });

    const markdown = [
      '# Night Event Visual Audit v1',
      '',
      `Static definitions: ${staticEvents.length} · Dynamic templates: ${dynamicEvents.length} · Audit rows: ${rows.length}`,
      '',
      '| Event / template | Title | Trigger | Choices | Previous | visualKey | Current | Shared |',
      '| --- | --- | --- | --- | --- | --- | --- | ---: |',
      ...rows.map((row) => `| \`${row.id}\` | ${row.title.replaceAll('|', '｜')} | DAY ${row.trigger.day.min}–${row.trigger.day.max} | ${row.choices.map((choice) => choice.label).join(' / ').replaceAll('|', '｜')} | A06 | \`${row.recommendedVisualCategory}\` | ${row.currentIllustration.canonicalId} · \`${row.currentIllustration.path}\` | ${row.currentIllustration.sharedWith.length} |`),
      '',
      'The companion JSON contains full event text, trigger fields, option costs/checks/results and all shared mappings.',
      '',
    ].join('\n');

    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/night-event-visual-audit.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
    writeFileSync('qa/playtest/out/night-event-visual-audit.md', markdown);
    expect(staticEvents).toHaveLength(51);
    expect(rows).toHaveLength(53);
    expect(rows.every((row) => row.choices.length === 3 && Boolean(row.currentIllustration.path))).toBe(true);
  });
});
