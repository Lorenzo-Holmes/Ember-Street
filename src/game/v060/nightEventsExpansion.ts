import type { Role } from '../types';
import {
  ALL_V060_NIGHT_EVENTS,
  NORMAL_NIGHT_EVENTS,
  type NightChoice,
  type NightEffect,
  type V060NightEvent,
} from './nightEvents';

const checked = (
  id: string,
  label: string,
  detail: string,
  role: Role,
  success: NightEffect,
  failure: NightEffect,
  partial: NightEffect = failure,
): NightChoice => ({
  id,
  label,
  detail,
  strategy: 'person',
  check: { label, role },
  outcomes: {
    failure,
    partial,
    success,
    critical: { ...success, hope: (success.hope ?? 0) + 1 },
  },
});

const resource = (
  id: string,
  label: string,
  detail: string,
  cost: NightChoice['cost'],
  effect: NightEffect,
): NightChoice => ({ id, label, detail, strategy: 'resource', cost, direct: effect });

const consequence = (
  id: string,
  label: string,
  detail: string,
  effect: NightEffect,
): NightChoice => ({ id, label, detail, strategy: 'consequence', direct: effect });

export const EXPANDED_NORMAL_NIGHT_EVENTS: V060NightEvent[] = [
  {
    id: 'awning-metal-tap',
    category: 'threat',
    minDay: 1,
    maxDay: 12,
    title: '南口雨棚一直在敲铁皮',
    body: '风每隔一阵就把松掉的雨棚掀起来。声音不算大，却足够沿着空街传出去。',
    choices: [
      checked('tie-down', '让守夜的人出去绑紧', '趁街上还看不见成群的影子，把松开的那一角重新捆住。', 'watch', { defense: 2 }, { actorCondition: 'minor', defense: -1 }),
      resource('rope', '拿材料把雨棚压住', '不用人在外面停太久，拿木条和绳子把那块铁皮直接压死。', { materials: 1 }, { defense: 2 }),
      consequence('leave', '今晚先让它响着', '没人出去。那一下又一下的金属声会继续往街外传。', { defense: -1, addFlags: ['awning_kept_tapping'] }),
    ],
  },
  {
    id: 'bicycle-alarm',
    category: 'threat',
    minDay: 2,
    maxDay: 14,
    title: '街外有辆电动车反复报警',
    body: '报警器响十几秒又停，过一会儿再响。每一次都比上一次更让人难受。',
    choices: [
      checked('silence', '摸出去把报警器拆掉', '守夜的人得离开围栏一小段，把声音彻底掐掉。', 'watch', { defense: 2, addFlags: ['bike_alarm_silenced'] }, { actorCondition: 'minor', defense: -2 }),
      resource('throw', '用东西远远砸坏它', '拿一块能扔远的金属件，从围栏里把报警器砸到不再响。', { parts: 1 }, { defense: 1, addFlags: ['bike_alarm_silenced'] }),
      consequence('wait', '等电池自己耗尽', '门不开。所有人只能数着下一次报警还要多久。', { hope: -1, addFlags: ['bike_alarm_left'] }),
    ],
  },
  {
    id: 'roof-shadow',
    category: 'threat',
    minDay: 6,
    maxDay: 22,
    title: '对面楼顶有影子停了很久',
    body: '它不像在游荡。那道影子在水箱旁边站了很久，偶尔才挪一下。',
    choices: [
      checked('observe', '让守夜的人继续盯着', '不靠近，只记它什么时候动、往哪边走。', 'watch', { defense: 3, addFlags: ['roof_route_observed'] }, { hope: -1 }),
      resource('light-roof', '用灯照一次楼顶', '把一束强光扫过去，至少确认那是不是活人。', { power: 5 }, { hope: 1, addFlags: ['roof_shadow_seen'] }),
      consequence('curtain', '把这边的窗全遮住', '不再看它，也不让楼顶轻易看清这里。', { defense: 1, hope: -1, addFlags: ['windows_blacked_out'] }),
    ],
  },
  {
    id: 'dragging-cart',
    category: 'threat',
    minDay: 13,
    maxDay: 28,
    title: '巷子里传来拖车轮子的声音',
    body: '吱呀声很慢，停一下，再往前一点。没人能确定推车的是活人还是别的东西。',
    choices: [
      checked('listen-route', '贴着墙判断声音位置', '守夜的人不出去，只沿着内侧墙面追声音，判断它会不会转进这条街。', 'watch', { defense: 3 }, { defense: -2 }),
      resource('decoy', '在另一侧制造一点动静', '用少量电力让远处的旧喇叭响一下，把注意力往另一条路牵。', { power: 4 }, { defense: 2 }),
      consequence('hold', '所有人留在原位', '不开灯、不出声，也不确认。轮子的声音最后消失在了更远的地方。', { addFlags: ['cart_sound_unchecked'] }),
    ],
  },
  {
    id: 'shelter-window-loose',
    category: 'infrastructure',
    minDay: 1,
    maxDay: 12,
    title: '宿营屋有扇窗一直撞墙',
    body: '窗扣早就坏了。风一大，玻璃和墙框就撞在一起，睡在旁边的人根本合不上眼。',
    choices: [
      checked('fix-latch', '让会修东西的人处理窗扣', '找一截还能受力的金属，把坏掉的窗扣重新接起来。', 'repair', { hope: 1 }, { actorCondition: 'minor' }),
      resource('board-window', '拿材料把窗固定住', '不修窗扣了，直接用木条把窗扇钉在墙框上。', { materials: 1 }, { hope: 1 }),
      consequence('cloth', '塞上布，先熬一晚', '声音会小一点，但风还是会从缝里往里钻。', { addFlags: ['window_still_loose'] }),
    ],
  },
  {
    id: 'battery-acid-smell',
    category: 'infrastructure',
    minDay: 2,
    maxDay: 16,
    title: '修车铺里有一股电瓶液的酸味',
    body: '一只旧电瓶的壳裂了。液体正顺着架子往下滴，旁边还堆着能用的线和零件。',
    choices: [
      checked('move-battery', '把漏液电瓶搬出去', '戴上能找到的手套，把那只沉东西从架子底下拖出来。', 'repair', { power: 2 }, { actorCondition: 'minor', power: -2 }),
      resource('replace-case', '拆零件换掉坏壳', '牺牲一点备件，把还能用的电芯转到完整外壳里。', { parts: 1 }, { power: 4 }),
      consequence('isolate', '把这一角先封起来', '不碰它，把周围能用的东西先挪开。修车铺今晚少一块能下脚的地方。', { addFlags: ['battery_corner_closed'] }),
    ],
  },
  {
    id: 'kitchen-gas-hiss',
    category: 'infrastructure',
    minDay: 5,
    maxDay: 20,
    title: '饭馆后厨传来很轻的漏气声',
    body: '阿禾把火关了以后，那一点“嘶”的声音还在。没人想等闻到味道再处理。',
    choices: [
      checked('trace-leak', '沿着管线找漏点', '拿肥皂水一点点抹过去，找到冒泡的位置再把接头拧紧。', 'repair', { hope: 1 }, { actorCondition: 'minor', hope: -1 }),
      resource('replace-hose', '换一截完整软管', '从仓房拿出还能用的管件，直接把老化那段换掉。', { parts: 1 }, { hope: 1 }),
      consequence('cold-kitchen', '关掉燃气到天亮', '今晚后厨不再点火。至少没人需要担心一颗火星。', { hope: -1, addFlags: ['kitchen_gas_closed'] }),
    ],
  },
  {
    id: 'water-barrel-crack',
    category: 'infrastructure',
    minDay: 10,
    maxDay: 28,
    title: '接雨水的桶裂了一道缝',
    body: '水正沿着墙根一点点流走。它不算珍贵到值得死人，但也没人愿意看着它白白漏掉。',
    choices: [
      checked('patch-barrel', '把裂缝补起来', '趁桶里还没漏空，用胶、铁片和手边能找到的东西把缝封上。', 'repair', { hope: 1 }, { actorCondition: 'minor' }),
      resource('new-container', '换一个完整容器', '拿材料临时做一个更稳的接水容器。', { materials: 1 }, { hope: 1 }),
      consequence('let-drain', '先把剩下的水分掉', '不修桶了，把还能接到的水分给各屋，空桶明天再说。', { addFlags: ['rain_barrel_lost'] }),
    ],
  },
  {
    id: 'blanket-dispute',
    category: 'survivor',
    minDay: 1,
    maxDay: 10,
    title: '有人为了两床厚毯子僵住了',
    body: '夜里比白天凉。两个人都说自己那间窗户漏风，也都没把手从毯子上松开。',
    choices: [
      checked('split-bedding', '让阿禾把铺盖重新分一下', '把谁睡哪间、哪边更冷说清楚，再从别处凑一点出来。', 'cook', { hope: 2 }, { hope: -1 }),
      resource('make-padding', '拿材料再垫一床', '用旧布、纸板和能保温的材料拼一床临时铺盖。', { materials: 1 }, { hope: 2 }),
      consequence('draw-lots', '让他们自己抽签', '公平得很干脆。抽到薄的那个人今晚也不会高兴。', { hope: -1, addFlags: ['blanket_lottery'] }),
    ],
  },
  {
    id: 'night-watch-swap',
    category: 'survivor',
    minDay: 3,
    maxDay: 16,
    title: '有人说自己今晚实在守不住了',
    body: '他已经连续打了几次瞌睡，又不肯直接离开街口，只问能不能有人替一会儿。',
    choices: [
      checked('rearrange', '把今晚的人手重新排一下', '找一个还能撑住的人换过去，让困得睁不开眼的先坐一会儿。', 'cook', { hope: 1, defense: 1 }, { hope: -1 }),
      resource('hot-drink', '给值夜的人留一份热的', '从口粮里匀一点出来，至少让守夜的人手里有碗热东西。', { ration: 1 }, { hope: 2 }),
      consequence('stay-post', '让原班继续守', '没人换班。困意不会因为一句“再坚持一下”就消失。', { defense: -1, addFlags: ['watch_shift_exhausted'] }),
    ],
  },
  {
    id: 'hidden-can',
    category: 'survivor',
    minDay: 6,
    maxDay: 22,
    title: '床底下找到了一只藏起来的罐头',
    body: '罐头没有开。真正难处理的是旁边那个人一直低着头，说那是给家里人留的。',
    choices: [
      checked('talk-can', '先把为什么藏起来问清楚', '不急着拿走。先让人把他担心的事说完，再决定这只罐头放哪。', 'cook', { hope: 2 }, { hope: -1 }),
      resource('replace-can', '让他留着，再从公粮补回去', '不收走那只罐头，从仓里的份额把账补平。', { ration: 1 }, { hope: 2, addFlags: ['private_ration_tolerated'] }),
      consequence('confiscate', '收回仓房', '罐头重新记进公粮。谁都知道这样最清楚，也都看见那个人的表情。', { inventory: { ration: 1 }, hope: -2, addFlags: ['hidden_food_confiscated'] }),
    ],
  },
  {
    id: 'doorway-sleeper',
    category: 'survivor',
    minDay: 12,
    maxDay: 28,
    title: '有人抱着包睡在门边',
    body: '他没有说要走，只是鞋没脱，包也没有放下。问起来时只说这样“方便一点”。',
    choices: [
      checked('sit-down', '找个人陪他坐一会儿', '不追问是不是要走，只把这几天发生的事慢慢聊完。', 'radio', { hope: 2 }, { hope: -1 }),
      resource('give-space', '给他腾一个安静的位置', '拿一点材料隔出一小块不被人来回踩过的地方，让包能真正放下来。', { materials: 1 }, { hope: 2 }),
      consequence('leave-door', '不去问', '门边的位置没人赶。他也一整夜没有把鞋脱下来。', { hope: -1, addFlags: ['doorway_sleeper_unasked'] }),
    ],
  },
];

const existingIds = new Set(ALL_V060_NIGHT_EVENTS.map((event) => event.id));
const additions = EXPANDED_NORMAL_NIGHT_EVENTS.filter((event) => !existingIds.has(event.id));
NORMAL_NIGHT_EVENTS.push(...additions);
ALL_V060_NIGHT_EVENTS.push(...additions);
