import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/game/engine.ts';
let source = readFileSync(path, 'utf8');

source = source.replace('const base: GameState = { version: 2, seed:', 'const base: GameState = { version: 3, seed:');

const oldResources = 'hordePressure: 12, hope: 8, parts: 0, supplies: 2, medicine: 1, power: 62, defense: 50, firstLightLevel: 1,';
const newResources = "hordePressure: 12, hope: 8, parts: 0, supplies: 2, medicine: 1, power: 62, defense: 50, inventory: { ration: 2, medicine: 1, power: 62, materials: 0, parts: 0 }, storyItems: [], mainLightStage: 1, dayAssignments: {}, dayState: { assignmentsLocked: false, returnedExpeditions: 0, unresolvedExpeditions: [] }, expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false }, mealState: { quality: 'cold', coverage: 0, cookingCapacity: 0, residentsFed: 0, rationCoverage: 1, consecutiveShortageDays: 0, wellFed: false, wellFedPlus: false }, nightState: { eventIndex: 0, eventTotal: 5, scheduledEventIds: [], emergencyEventIds: [], currentEventId: null, hordeActive: false, hordeStage: null, resolutions: [] }, campaignStats: { rescued: 0, deaths: 0, missing: 0, expeditions: 0, locationsDiscovered: 0, nightEventsResolved: 0, emergencyEventsResolved: 0 }, ending: null, firstLightLevel: 1,";
if (source.includes(oldResources)) source = source.replace(oldResources, newResources);

source = source.replace("return { ...survivor, trait: survivor.trait ?? traits[survivor.specialty] ?? '活下去', trust: survivor.trust ?? 0, injury: survivor.injury ?? 'healthy' };", "return { ...survivor, trait: survivor.trait ?? traits[survivor.specialty] ?? '活下去', trust: survivor.trust ?? 0, injury: survivor.injury ?? 'healthy', condition: survivor.condition ?? (survivor.energy < 40 ? 'fatigued' : 'healthy') };");

writeFileSync(path, source);
