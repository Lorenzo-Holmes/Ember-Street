import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/game/story.ts';
let source = readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Migration anchor missing: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  "const hasAny = (state: GameState, flags: string[] = []) => flags.length === 0 || flags.some((flag) => hasFlag(state, flag));\n",
  "const hasAny = (state: GameState, flags: string[] = []) => flags.length === 0 || flags.some((flag) => hasFlag(state, flag));\nconst campaignCopy = (value: string) => value.replace(/DAY 7/g, 'DAY 30').replace(/第七天/g, '第三十天');\n",
  'campaign copy helper',
);

replaceOnce(
  "    logs: [...logs.slice(-59), { id: `story-${state.day}-${logs.length}-${title}`, day: state.day, time, title, body, tone }],",
  "    logs: [...logs.slice(-59), { id: `story-${state.day}-${logs.length}-${campaignCopy(title)}`, day: state.day, time, title: campaignCopy(title), body: campaignCopy(body), tone }],",
  'story log copy',
);

replaceOnce(
  "  if (state.day < event.minDay || state.day > event.maxDay) return false;",
  "  const effectiveMaxDay = event.maxDay <= 6 ? 30 : event.maxDay;\n  if (state.day < event.minDay || state.day > effectiveMaxDay) return false;",
  'thirty-day eligibility',
);

replaceOnce(
  "  const count = state.day <= 2 ? 2 : 3;",
  "  const count = 1;",
  'daily story count',
);

const start = source.indexOf('export function storyEventsForState(state: GameState): StoryEventView[] {');
const end = source.indexOf('\nfunction getDefinition(eventId: string): StoryEventDefinition | undefined {', start);
if (start < 0 || end < 0) throw new Error('Migration anchor missing: storyEventsForState');
const replacement = `export function storyEventsForState(state: GameState): StoryEventView[] {
  const ids = state.storyDailyIds ?? [];
  return ids
    .filter((id) => !(state.resolvedStoryEventIds ?? []).includes(id))
    .map((id) => EVENTS.find((event) => event.id === id))
    .filter((event): event is StoryEventDefinition => Boolean(event))
    .map(({ minDay: _min, maxDay: _max, requiresFlags: _rf, requiresAnyFlags: _raf, excludesFlags: _ef, requiresSurvivor: _rs, requiresBuilding: _rb, choices, ...view }) => ({
      ...view,
      kicker: campaignCopy(view.kicker).replace(/^DAY\\s+\\d+/, \`DAY \${state.day}\`),
      title: campaignCopy(view.title),
      body: campaignCopy(view.body),
      quote: view.quote ? campaignCopy(view.quote) : undefined,
      choices: choices.map(({ cost: _cost, effect: _effect, check: _check, ...choice }) => ({
        ...choice,
        label: campaignCopy(choice.label),
        detail: campaignCopy(choice.detail),
        checkLabel: choice.checkLabel ? campaignCopy(choice.checkLabel) : undefined,
      })),
    }));
}
`;
source = source.slice(0, start) + replacement + source.slice(end);

writeFileSync(path, source);
console.log('Applied v0.5.0 thirty-day Story Pool migration.');
