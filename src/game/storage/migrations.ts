import { createDefaultCampaignStats, createDefaultDayState, createDefaultExpeditionState, createDefaultMealState, createDefaultNightState, normalizeSurvivor } from '../foundation';
import { forecastFor } from '../progression';
import { normalizeSeed } from '../rng';
import type { Buildings, DayAssignment, GameState, Survivor } from '../types';
import { normalizeCommunityState } from '../v060/community';
import { normalizeSocialState } from '../v060/socialPressure';

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const PHASES: GameState['phase'][] = ['dawn', 'street', 'assignment', 'expedition', 'dusk', 'night', 'night-summary', 'summary', 'ending'];

function legacySurvivors(value: unknown): Survivor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item.id || !item.name) return [];
    const injury = String(item.injury ?? 'healthy');
    const condition = item.condition ?? (injury === 'serious' ? 'serious' : injury === 'minor' ? 'minor' : num(item.energy, 70) < 40 ? 'fatigued' : 'healthy');
    const specialty = String(item.specialty ?? 'rest') as Survivor['specialty'];
    return [normalizeSurvivor({
      id: String(item.id), name: String(item.name), specialty,
      energy: clamp(num(item.energy, 70)), mood: (item.mood === 'low' || item.mood === 'bright') ? item.mood : 'steady',
      perk: String(item.perk ?? item.trait ?? '活下去'), trait: String(item.trait ?? item.perk ?? '活下去'),
      trust: clamp(num(item.trust, 0), 0, 3) as 0 | 1 | 2 | 3,
      condition: condition as Survivor['condition'],
    })];
  });
}

function legacyAssignments(value: unknown): Record<string, DayAssignment> {
  const source = asRecord(value);
  const output: Record<string, DayAssignment> = {};
  for (const [id, raw] of Object.entries(source)) {
    const role = String(raw);
    const job = role === 'search' ? 'expedition' : role;
    if (['expedition', 'repair', 'medical', 'watch', 'radio', 'cook', 'rest'].includes(job)) output[id] = job as DayAssignment;
  }
  return output;
}

function legacyBuildings(value: unknown, searchStationRepaired: unknown): Buildings {
  const source = asRecord(value);
  return {
    searchStation: Math.max(searchStationRepaired ? 1 : 0, clamp(num(source.searchStation), 0, 3)),
    workshop: clamp(num(source.workshop), 0, 3), clinic: clamp(num(source.clinic), 0, 3),
    watchPost: clamp(num(source.watchPost), 0, 3), shelter: clamp(num(source.shelter), 0, 3), radio: clamp(num(source.radio), 0, 3),
  };
}

function slotSalvage(legacy: Record<string, unknown>): { ration: number; medicine: number; power: number } {
  let ration = 0; let medicine = 0; let power = 0;
  const tierValue = (tier: unknown) => Number(tier) === 3 ? 6 : Number(tier) === 2 ? 3 : 1;
  const addKind = (kind: unknown, amount: number) => {
    if (kind === 'ration') ration += amount;
    if (kind === 'medical') medicine += amount;
    if (kind === 'battery') power += amount * 5;
  };
  if (Array.isArray(legacy.slots)) for (const raw of legacy.slots) { const item = asRecord(raw); if (item.kind) addKind(item.kind, tierValue(item.tier)); }
  if (Array.isArray(legacy.racks)) {
    const stock = Array.isArray(legacy.rackStock) ? legacy.rackStock : [];
    legacy.racks.forEach((kind, index) => addKind(kind, Math.max(0, Math.floor(num(stock[index], 0)))));
  }
  return { ration, medicine, power };
}

export function promoteV2ToV3(input: unknown): GameState | null {
  const legacy = asRecord(input);
  const version = num(legacy.version, 0);
  if (version !== 2 && version !== 3) return null;
  const day = clamp(num(legacy.day, 1), 1, 30);
  const seed = normalizeSeed(num(legacy.seed, Date.now()));
  const inventoryInput = asRecord(legacy.inventory);
  const salvage = slotSalvage(legacy);
  const inventory = {
    ration: Math.max(0, Math.floor(num(inventoryInput.ration, num(legacy.supplies, 0)) + (version === 2 ? salvage.ration : 0))),
    medicine: Math.max(0, Math.floor(num(inventoryInput.medicine, num(legacy.medicine, 0)) + (version === 2 ? salvage.medicine : 0))),
    power: clamp(Math.floor(num(inventoryInput.power, num(legacy.power, 62)) + (version === 2 ? salvage.power : 0))),
    materials: Math.max(0, Math.floor(num(inventoryInput.materials, 0))),
    parts: Math.max(0, Math.floor(num(inventoryInput.parts, num(legacy.parts, 0)))),
  };
  const campaignInput = asRecord(legacy.campaignStats);
  const campaignStats = {
    ...createDefaultCampaignStats(),
    rescued: Math.max(0, Math.floor(num(campaignInput.rescued, 0))), deaths: Math.max(0, Math.floor(num(campaignInput.deaths, 0))),
    missing: Math.max(0, Math.floor(num(campaignInput.missing, 0))), civilianDepartures: Math.max(0, Math.floor(num(campaignInput.civilianDepartures, 0))),
    expeditions: Math.max(0, Math.floor(num(campaignInput.expeditions, 0))),
    locationsDiscovered: Math.max(0, Math.floor(num(campaignInput.locationsDiscovered, 0))),
    nightEventsResolved: Math.max(0, Math.floor(num(campaignInput.nightEventsResolved, 0))),
    emergencyEventsResolved: Math.max(0, Math.floor(num(campaignInput.emergencyEventsResolved, 0))),
  };
  const storyFlags = Array.isArray(legacy.storyFlags) ? legacy.storyFlags.map(String) : [];
  const rawPhase = String(legacy.phase ?? 'street') as GameState['phase'];
  const phase: GameState['phase'] = version === 3 && PHASES.includes(rawPhase) ? rawPhase : day >= 30 ? 'ending' : 'street';
  const rawPending = version === 3 && legacy.pendingCheck && typeof legacy.pendingCheck === 'object' ? legacy.pendingCheck as GameState['pendingCheck'] : null;
  const civilianResidents = Math.max(0, Math.floor(num(legacy.civilianResidents, campaignStats.rescued)));
  return {
    version: 3,
    seed,
    rngState: normalizeSeed(num(legacy.rngState, seed)),
    phase,
    day,
    inventory,
    storyItems: Array.isArray(legacy.storyItems) ? legacy.storyItems.map(String) : [],
    storyFlags,
    mainLightStage: clamp(num(legacy.mainLightStage, Math.ceil(num(legacy.firstLightLevel, 1) / 2)), 1, 5) as 1 | 2 | 3 | 4 | 5,
    civilianResidents,
    communityState: normalizeCommunityState(legacy.communityState, civilianResidents),
    socialState: normalizeSocialState(legacy.socialState),
    dayAssignments: version === 3 ? legacyAssignments(legacy.dayAssignments) : legacyAssignments(legacy.assignments),
    dayState: { ...createDefaultDayState(), ...asRecord(legacy.dayState), committedSurvivorIds: Array.isArray(asRecord(legacy.dayState).committedSurvivorIds) ? (asRecord(legacy.dayState).committedSurvivorIds as unknown[]).map(String) : [] },
    expeditionState: { ...createDefaultExpeditionState(), ...asRecord(legacy.expeditionState) } as GameState['expeditionState'],
    mealState: { ...createDefaultMealState(), ...asRecord(legacy.mealState) } as GameState['mealState'],
    nightState: { ...createDefaultNightState(), ...asRecord(legacy.nightState) } as GameState['nightState'],
    campaignStats,
    memorials: Array.isArray(legacy.memorials) ? legacy.memorials as GameState['memorials'] : [],
    finalHordeResult: legacy.finalHordeResult as GameState['finalHordeResult'],
    ending: legacy.ending && typeof legacy.ending === 'object' ? legacy.ending as GameState['ending'] : null,
    hope: clamp(num(legacy.hope, 20)),
    defense: clamp(num(legacy.defense, 55)),
    survivors: legacySurvivors(legacy.survivors),
    buildings: legacyBuildings(legacy.buildings, legacy.searchStationRepaired),
    forecast: forecastFor(day),
    chapterComplete: Boolean(legacy.chapterComplete) || day >= 30,
    pendingCheck: rawPending,
    lastMessage: version === 2 ? '旧存档已迁移到 v0.6 · 七格物资已经回收到物资箱。' : String(legacy.lastMessage ?? `DAY ${day}`),
  };
}