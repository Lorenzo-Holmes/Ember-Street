import type { V060NightEvent } from './nightEvents';

export interface MortalityNightEvent extends V060NightEvent {
  minResidents?: number;
}

export const MORTALITY_NIGHT_EVENTS: MortalityNightEvent[] = [
  {
    id: 'resident-fever', category: 'survivor', minDay: 6, maxDay: 28, minResidents: 1,
    title: '宿营屋里有人开始高烧',
    body: '一个刚安置不久的居民缩在墙边发抖。伤口被衣袖遮着，没人能确定那只是感染，还是更糟的东西。',
    choices: [
      {
        id: 'medical-check', label: '让医疗岗位立刻检查', detail: '不直接消耗药品，但失败会让感染失控。', strategy: 'person',
        check: { label: '判断感染并处理伤口', role: 'medical' },
        outcomes: {
          failure: { hope: -2, addFlags: ['civilian_loss:1:感染失控'] },
          partial: { hope: -1, addFlags: ['resident_infection_contained'] },
          success: { hope: 1, addFlags: ['resident_infection_treated'] },
          critical: { hope: 2, addFlags: ['resident_infection_treated'] },
        },
      },
      { id: 'medicine', label: '直接使用药品', detail: '药品 -1，优先把情况控制下来。', strategy: 'resource', cost: { medicine: 1 }, direct: { hope: 1, addFlags: ['resident_infection_treated'] } },
      { id: 'isolate', label: '立即隔离', detail: '不冒险接触，但居民会因此更加恐慌。', strategy: 'consequence', direct: { hope: -1, addFlags: ['resident_isolated'] } },
    ],
  },
];

export const MORTALITY_EMERGENCY_EVENTS: MortalityNightEvent[] = [
  {
    id: 'emergency-shelter-stampede', category: 'emergency', minDay: 9, maxDay: 29, minResidents: 4,
    title: '宿营区突然发生踩踏',
    body: '外面的撞击声把人群惊醒。有人冲向同一扇门，床架倒下以后，尖叫声让场面彻底失控。',
    choices: [
      {
        id: 'organize', label: '让守备岗位组织人群', detail: '靠秩序把所有人重新分开。失败会造成人员损失。', strategy: 'person',
        check: { label: '组织宿营区撤散', role: 'watch' },
        outcomes: {
          failure: { hope: -3, addFlags: ['civilian_loss:1:宿营区踩踏'] },
          partial: { hope: -1, defense: -1 },
          success: { hope: 1 },
          critical: { hope: 2, defense: 1 },
        },
      },
      { id: 'barriers', label: '拆材料做临时分流', detail: '材料 -1，把人群分成两条通道。', strategy: 'resource', cost: { materials: 1 }, direct: { hope: 1 } },
      { id: 'open-yard', label: '打开外侧空地', detail: '快速疏散，但有人会在黑暗里被冲散。', strategy: 'consequence', direct: { hope: -2, addFlags: ['civilian_loss:1:混乱撤离'] } },
    ],
  },
];

export const MORTALITY_HORDE_EVENTS: MortalityNightEvent[] = [
  {
    id: 'horde-resident-breach', category: 'horde', minDay: 10, maxDay: 29, minResidents: 2,
    title: '尸群撞进了居民避难区',
    body: '侧门固定件被撞开以后，最里面的人群开始向后退。现在必须有人把缺口重新封住。',
    choices: [
      {
        id: 'hold', label: '让守备岗位顶住缺口', detail: '成功可以保住人群；失败可能一次失去两名居民。', strategy: 'person',
        check: { label: '守住居民避难区', role: 'watch' },
        outcomes: {
          failure: { defense: -6, hope: -4, addFlags: ['civilian_loss:2:尸潮突破'] },
          partial: { defense: -3, hope: -1, addFlags: ['civilian_loss:1:尸潮突破'] },
          success: { defense: 2, hope: 1 },
          critical: { defense: 4, hope: 2 },
        },
      },
      { id: 'seal', label: '用材料封死通道', detail: '材料 -2，牺牲一段内部通道换居民安全。', strategy: 'resource', cost: { materials: 2 }, direct: { defense: 1 } },
      { id: 'fallback', label: '放弃这一段街区', detail: '让所有人后撤，但混乱里仍可能有人没跟上。', strategy: 'consequence', direct: { defense: -4, hope: -2, addFlags: ['civilian_loss:1:紧急后撤'] } },
    ],
  },
];
