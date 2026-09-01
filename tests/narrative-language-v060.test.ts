import { describe, expect, it } from 'vitest';
import { CAMPAIGN_FIXED_EVENTS } from '../src/game/v060/campaignEvents';
import {
  EXPEDITION_LOCATIONS,
  GENERIC_EXPEDITION_EVENTS,
  LOCATION_EXPEDITION_EVENTS,
} from '../src/game/v060/expeditionStories';
import { EMERGENCY_EVENTS, HORDE_EVENTS, NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEvents';

const SYSTEM_LANGUAGE = /(系统|玩家|用户|解锁|触发|事件池|后续事件|稳定确认|没有立即代价|医疗能力会受影响|没有奖励|隐藏任务|推荐入口|最终筛选)/;
const ABSTRACT_RISK_LANGUAGE = /(接受.{0,6}风险|承担.{0,6}风险|不付出资源|用.{0,6}换稳定|稳定处理|稳定且昂贵|前期缓冲|DAY29\s*准备)/;

function expectClean(text: string, source: string) {
  expect(text, `${source} contains system-facing language`).not.toMatch(SYSTEM_LANGUAGE);
  expect(text, `${source} describes mechanics instead of a concrete scene`).not.toMatch(ABSTRACT_RISK_LANGUAGE);
}

describe('v0.6 narrative UI language guard', () => {
  it('keeps night event bodies and choice details inside the world', () => {
    for (const event of [...NORMAL_NIGHT_EVENTS, ...HORDE_EVENTS, ...EMERGENCY_EVENTS]) {
      expectClean(event.body, `${event.id}.body`);
      for (const choice of event.choices) {
        expectClean(choice.detail, `${event.id}:${choice.id}.detail`);
      }
    }
  });

  it('keeps exploration cards written like map knowledge instead of design notes', () => {
    for (const location of EXPEDITION_LOCATIONS) {
      expectClean(location.description, `${location.id}.description`);
      for (const feature of location.features) expectClean(feature, `${location.id}.feature`);
    }
    for (const event of [...GENERIC_EXPEDITION_EVENTS, ...LOCATION_EXPEDITION_EVENTS]) {
      expectClean(event.body, `${event.id}.body`);
    }
  });

  it('keeps fixed-event actions free of unlock and system terminology', () => {
    for (const event of CAMPAIGN_FIXED_EVENTS) {
      expectClean(event.title, `${event.id}.title`);
      expectClean(event.body, `${event.id}.body`);
      expectClean(event.actionLabel, `${event.id}.actionLabel`);
    }
  });
});