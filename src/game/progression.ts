import { CHAPTER_FINAL_DAY } from './config';
import type { DayForecast, Survivor } from './types';

export const SURVIVOR_ROSTER: Survivor[] = [
  { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 88, mood: 'bright', perk: '先看退路', trait: '每到一处，总先记住能退回来的门', trust: 1, condition: 'healthy' },
  { id: 'zhou', name: '老周', specialty: 'repair', energy: 82, mood: 'steady', perk: '修不好不睡', trait: '夜里听见线路异响，也会披衣起身', trust: 1, condition: 'healthy' },
  { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 92, mood: 'bright', perk: '热饭很重要', trait: '盛饭前，总要先数清屋里有几个人', trust: 1, condition: 'healthy' },
  { id: 'cheng', name: '程医生', specialty: 'medical', energy: 78, mood: 'steady', perk: '先救能救的', trait: '袖口总沾着洗不净的药水味', trust: 1, condition: 'healthy' },
  { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 86, mood: 'steady', perk: '听声辨位', trait: '说话很轻，耳朵却总朝着街口', trust: 1, condition: 'healthy' },
  { id: 'xiaoman', name: '小满', specialty: 'radio', energy: 90, mood: 'bright', perk: '别让声音断掉', trait: '守着电台时，会把每个呼号抄两遍', trust: 1, condition: 'healthy' },
];

const FIXED: Record<number, DayForecast> = {
  1: { title: '雨停以后', detail: '小饭馆门口还有积水。南口那辆白色面包车又被撞歪了一点。', intensity: 1 },
  5: { title: '街口的人多了', detail: '饭桌旁多了几张脸，仓房却没有跟着变满。', intensity: 2 },
  10: { title: '北边整夜没停过', detail: '凌晨以后，远处的撞击声越来越密。守夜的人谁都没提换班。', intensity: 4 },
  15: { title: '半个月了', detail: '大家已经不再问什么时候能回家，开始问今晚谁守门。', intensity: 3 },
  20: { title: '又开始了', detail: '远处成片的声音正在往这边靠，比上一次更近。', intensity: 5 },
  24: { title: '能走的路越来越少', detail: '几个熟悉的路口已经过不去了，出去的人回来得越来越晚。', intensity: 4 },
  27: { title: '把能钉的都钉上', detail: '铁皮、门板、电线、药和水都被重新清点了一遍。没人说为什么。', intensity: 5 },
  29: { title: '最后的白天', detail: '北边从昨晚起就没安静过。天黑前，把该做的都做完。', intensity: 6 },
  30: { title: '天亮以后', detail: '街上第一次这么安静。过去那些事，现在终于有了结果。', intensity: 0 },
};

const ROTATING: DayForecast[] = [
  { title: '短暂晴天', detail: '太阳从楼缝里照下来，湿衣服终于能晾干。街外也看得比平时远。', intensity: 2 },
  { title: '低云', detail: '云压得很低。声音像贴着楼墙往前走，远处一声碰撞能传半条街。', intensity: 3 },
  { title: '远处火光', detail: '城南一夜都在发红。没人知道烧的是什么，只知道那边的东西会往别处走。', intensity: 3 },
  { title: '无风', detail: '一整早没有风。敲钉子、拖铁皮、鞋底蹭过地面的声音都显得太响。', intensity: 2 },
  { title: '潮湿的一天', detail: '墙面一夜没干。电线偶尔噼啪作响，包扎过的伤口也开始发痒。今天说话的人比平时少。', intensity: 3 },
];

export function forecastFor(day: number): DayForecast {
  if (FIXED[day]) return FIXED[day];
  if (day > CHAPTER_FINAL_DAY) return { title: '余烬之后', detail: '第一章已经结束。', intensity: 0 };
  const base = ROTATING[(day * 7 + Math.floor(day / 3)) % ROTATING.length];
  const phaseBonus = day >= 24 ? 1 : day >= 16 ? 1 : 0;
  return { ...base, intensity: Math.min(5, base.intensity + phaseBonus) };
}
