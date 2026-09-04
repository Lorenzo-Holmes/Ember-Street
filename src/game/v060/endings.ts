import type { EndingId, EndingResult, FinalHordeResult, GameState } from '../types';

export interface EndingDefinition { id: EndingId; title: string; tier: EndingResult['tier']; hint: string; summary: string; }
export interface MetaProgress { endingsUnlocked: EndingId[]; totalRuns: number; bestFinalHordeResult: FinalHordeResult | null; }

export const ENDINGS: Record<EndingId, EndingDefinition> = {
  E01: { id: 'E01', title: '黎明车队', tier: 'good', hint: '有人一直在监听无线电。', summary: '清晨的雾里出现了车灯。军方终于确认余烬长街的位置，伤员和居民被分批送上车。老周最后一次关掉主灯——这一次，不再需要它替任何人带路。' },
  E02: { id: 'E02', title: '灯火长街', tier: 'good', hint: '有时候，没人来救也不意味着失败。', summary: '没有车队，也没有直升机。可太阳升起时，没有人收拾行李。余烬长街已经有自己的诊疗、守备、厨房和广播。后来人们不再称这里为避难点，只说：回街上去。' },
  E03: { id: 'E03', title: '第二个灯塔', tier: 'good', hint: '一盏灯能让很远的人看见。', summary: '广播之后，先是两个人，后来是五个人。更远的街区也开始回信。余烬长街没有等到救世主，它自己变成了别人寻找的方向。' },
  E04: { id: 'E04', title: '带他们回家', tier: 'good', hint: '活下来的人，也需要一个可以称作家的地方。', summary: '这三十天没有让所有伤口消失，但留下的人已经学会怎样一起过日子。那些名字、争吵、热饭和夜谈，最后比任何围栏都更像一个家。' },
  E05: { id: 'E05', title: '我们留下', tier: 'normal', hint: '明天依然会有工作。', summary: '没有奇迹，也没有彻底的胜利。第 31 天清晨，路线屋照常开门，修车铺重新响起敲击声。有人问今天该去哪里找东西——于是大家继续活下去。' },
  E06: { id: 'E06', title: '向南', tier: 'normal', hint: '知道一条路，有时比守住一堵墙更重要。', summary: '最终尸潮留下的损伤太重。天亮以后，大家沿着此前确认的撤离路线向南走。最后一个人回头时，主灯仍在晨雾里亮着。' },
  E07: { id: 'E07', title: '最后一次广播', tier: 'normal', hint: '声音也可以留下证据。', summary: '广播间撑到了最后。撤离前，小满把最后一段话送了出去：余烬长街即将关闭，这里曾经有人，也有人活了下来。然后她切断电源。' },
  E08: { id: 'E08', title: '一条小街', tier: 'normal', hint: '人数不多，也可以成为生活。', summary: '留下的人不多。没有宏大的计划，也没有谁再谈重建城市。阿禾只问了一句：明天吃什么？有人笑着说，明天再想。' },
  E09: { id: 'E09', title: '灯灭了', tier: 'bad', hint: '主灯不仅仅是照明。', summary: '太阳升起时，主灯没有重新亮起来。街区还没有立刻死去，可每个人都知道某种东西已经结束。人们开始把能带走的东西装进包里。' },
  E10: { id: 'E10', title: '街散了', tier: 'bad', hint: '人还活着，不等于还在一起。', summary: '天亮以后，已经没人再问今天该做什么。门一扇扇关上，路线屋、修车铺和诊疗室不再有人主动开门。即使街上还留着脚步，大家也不再把这里当作同一个家。主灯仍然亮着，却再也照不出一个共同的去处。' },
  E11: { id: 'E11', title: '北门之后', tier: 'bad', hint: '街没了，人未必也要留下。', summary: '北门之后，防线再也没有重新连起来。幸存者从另一条街撤出去，在远处看着余烬长街冒烟。街区失守了，但很多人成功离开。' },
  E12: { id: 'E12', title: '最后的守灯人', tier: 'bad', hint: '只要灯还亮着，就可能有人回来。', summary: '最后只剩很少的人。没有足够的力量守住整条街，他们仍把主灯留着。天快亮时，远处似乎出现了一个正在靠近的人影。' },
  E13: { id: 'E13', title: 'DAY 31', tier: 'secret', hint: '也许，灯不只照亮这一条街。', summary: '画面黑下去以后，DAY 31 再次亮起。小灰从街口走过，一个孩子在主灯下面写下“欢迎回来”。远方第一盏灯亮起，随后是第二盏、第三盏。灯不是为了照亮自己。' },
};

const presentCore = (state: GameState) => state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing');
const population = (state: GameState) => presentCore(state).length + Math.max(0, state.civilianResidents);
const flag = (state: GameState, name: string) => state.storyFlags.includes(name);
const buildingSum = (state: GameState) => Object.values(state.buildings).reduce((sum, value) => sum + value, 0);
const highTrustCount = (state: GameState) => presentCore(state).filter((s) => (s.trust ?? 0) >= 2).length;
const coreAliveCount = (state: GameState) => presentCore(state).filter((s) => ['lin-xia', 'zhou', 'ahe', 'cheng', 'aliang', 'xiaoman'].includes(s.id)).length;

export function resolveEnding(state: GameState): EndingResult {
  const final = state.finalHordeResult ?? 'damaged';
  const residents = population(state); const rescued = state.campaignStats.rescued; const trust = highTrustCount(state);
  const coreAlive = coreAliveCount(state); const built = buildingSum(state); const radio = state.buildings.radio;
  const held = final === 'perfect' || final === 'held'; let id: EndingId = 'E05';

  if (final === 'perfect' && coreAlive >= 6 && state.campaignStats.deaths === 0 && rescued >= 8 && built >= 14 && radio >= 3 && state.mainLightStage >= 4 && state.inventory.power >= 25 && state.hope >= 75 && trust >= 5) id = 'E13';
  else if (coreAlive >= 5 && trust >= 4 && state.hope >= 55 && held) id = 'E04';
  else if (radio >= 3 && rescued >= 6 && (flag(state, 'external_contact') || flag(state, 'military_contact')) && held) id = 'E03';
  else if (rescued >= 5 && flag(state, 'military_contact') && final !== 'breached') id = 'E01';
  else if (residents >= 6 && state.hope >= 60 && built >= 11 && held) id = 'E02';
  else if (residents <= 2 && state.mainLightStage >= 2 && state.inventory.power > 5) id = 'E12';
  else if (final === 'breached' && residents >= 3) id = 'E11';
  else if (flag(state, 'main_light_went_dark') || state.inventory.power <= 5) id = 'E09';
  else if (residents <= 2 || state.hope <= 12) id = 'E10';
  else if ((flag(state, 'subway_exit_known') || flag(state, 'evacuation_route_known')) && (final === 'damaged' || final === 'breached')) id = 'E06';
  else if (radio >= 3 && (final === 'damaged' || final === 'breached')) id = 'E07';
  else if (residents >= 3 && residents <= 5 && state.hope >= 30 && final !== 'breached') id = 'E08';

  const ending = ENDINGS[id];
  return { id, title: ending.title, tier: ending.tier, summary: ending.summary };
}

export function endingHint(id: EndingId): string { return ENDINGS[id].hint; }
export function defaultMetaProgress(): MetaProgress { return { endingsUnlocked: [], totalRuns: 0, bestFinalHordeResult: null }; }

const META_KEY = 'ember-street-meta-v1';
const resultRank: Record<FinalHordeResult, number> = { breached: 0, damaged: 1, held: 2, perfect: 3 };

export function loadMetaProgress(): MetaProgress {
  if (typeof localStorage === 'undefined') return defaultMetaProgress();
  try { const parsed = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as MetaProgress | null; return parsed ? { ...defaultMetaProgress(), ...parsed } : defaultMetaProgress(); }
  catch { return defaultMetaProgress(); }
}

export function recordEnding(meta: MetaProgress, ending: EndingResult, result: FinalHordeResult): MetaProgress {
  const endingsUnlocked = meta.endingsUnlocked.includes(ending.id) ? meta.endingsUnlocked : [...meta.endingsUnlocked, ending.id];
  const best = !meta.bestFinalHordeResult || resultRank[result] > resultRank[meta.bestFinalHordeResult] ? result : meta.bestFinalHordeResult;
  const next = { endingsUnlocked, totalRuns: meta.totalRuns + 1, bestFinalHordeResult: best };
  if (typeof localStorage !== 'undefined') localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}
