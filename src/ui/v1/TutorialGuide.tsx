import { useEffect, useRef, useState } from 'react';
import type { BuildingId, GameState, TutorialHint } from '../../game/types';
import { canUpgradeBuilding } from '../../game/v060/buildings';
import {
  acknowledgeTutorialPage, dismissTutorialNotice, hasTutorialRoute, skipTutorial,
  tutorialIsActive,
} from '../../game/v060/tutorial';
import type { V1NavTarget } from './V1BottomNav';
import './tutorial.css';

interface Props {
  state: GameState;
  onCommit: (state: GameState) => void;
  onNavigate: (target: V1NavTarget) => void;
}

type Context = 'home' | 'people' | 'jobs' | 'route' | 'expedition' | 'dusk' | 'night' | 'dawn' | 'records' | 'interrupt';

function contextFor(root: HTMLElement): Context {
  if (root.querySelector('.notebook-page--story-event, .notebook-page--attention, .notebook-page--community-event')) return 'interrupt';
  if (root.querySelector('.notebook-page--survivor-detail')) return 'jobs';
  if (root.querySelector('.notebook-page--route')) return 'route';
  if (root.querySelector('.notebook-page--expedition-event')) return 'expedition';
  if (root.querySelector('.notebook-page--dusk-v1')) return 'dusk';
  if (root.querySelector('.notebook-page--night')) return 'night';
  if (root.querySelector('.notebook-page--night-summary-v1, .notebook-page--dawn-v1')) return 'dawn';
  if (root.querySelector('.notebook-page--survivors')) return 'people';
  if (root.querySelector('.notebook-page--records')) return 'records';
  return 'home';
}

function targetSelector(state: GameState, context: Context): string {
  const step = state.tutorial?.tutorialStage;
  if (context === 'interrupt') return '.v1-phase-primary, .v6-expedition-choices, .v6-missing-continue';
  if (step === 'INTRO' || step === 'RESOURCE_OVERVIEW') return '[data-tutorial="resources"]';
  if (context === 'jobs') return step === 'ASSIGN_SURVIVOR'
    ? '[data-tutorial-job="cook"]:not(:disabled), [data-tutorial-job="rest"]:not(:disabled)'
    : '[data-tutorial-job="expedition"]:not(:disabled)';
  if (context === 'route') return '[data-tutorial="confirm-route"]';
  if (context === 'expedition') return '.v1e-event-copy';
  if (context === 'dusk') return '[data-tutorial="end-day"]';
  if (context === 'night') return '.v1n-event-copy, .v1n-primary';
  if (context === 'dawn') return '.v1-phase-primary';
  if (step === 'OPEN_LOG') return '[data-tutorial-nav="records"]';
  if (context === 'people') {
    if (step === 'SEND_EXPEDITION' && hasTutorialRoute(state)) return '[data-tutorial="dispatch"]';
    return '[data-tutorial-person][data-assigned="false"], [data-tutorial-person]';
  }
  return '[data-tutorial="day-action"], [data-tutorial-nav="survivors"]';
}

function nextHint(state: GameState): TutorialHint | undefined {
  const tutorial = state.tutorial;
  if (!tutorial?.tutorialCompleted || tutorial.tutorialSkipped || !tutorial.freePlayNoticeSeen
    || !['street', 'assignment'].includes(state.phase)) return undefined;
  if (!tutorial.hintsSeen.includes('injury') && state.survivors.some((person) => ['minor', 'serious', 'critical'].includes(person.condition ?? ''))) return 'injury';
  const population = state.civilianResidents + state.survivors.filter((person) => !['dead', 'missing'].includes(person.condition ?? '')).length;
  if (!tutorial.hintsSeen.includes('population') && population !== tutorial.initialPopulation) return 'population';
  if (!tutorial.hintsSeen.includes('building') && (Object.keys(state.buildings) as BuildingId[]).some((id) => canUpgradeBuilding(state, id).allowed)) return 'building';
  return undefined;
}

const HINTS: Record<TutorialHint, [string, string]> = {
  injury: ['伤口不会自己消失', '伤势会影响能做的工作和探索风险。翻开幸存者，查看身体状况；诊疗和休息各有用途。'],
  building: ['有些地方可以修了', '材料和零件够时，可以在建筑页抢修或升级。先读清用料和用途，修哪一处由你决定。'],
  population: ['街里的人数变了', '加入、离开、失踪和死亡都会改变吃饭的人数。有名字的幸存者单独安排，其他居民参加街区轮值。'],
};

export default function TutorialGuide({ state, onCommit, onNavigate }: Props) {
  const note = useRef<HTMLElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const [context, setContext] = useState<Context>('home');
  const active = tutorialIsActive(state);
  const step = state.tutorial?.tutorialStage;
  const freeNotice = Boolean(state.tutorial?.tutorialCompleted && !state.tutorial.freePlayNoticeSeen);
  const hint = nextHint(state);
  const visible = active || freeNotice || Boolean(hint);

  useEffect(() => {
    const element = note.current;
    const root = element?.parentElement;
    if (!element || !root || !active) return;
    const update = () => {
      const nextContext = contextFor(root);
      setContext(nextContext);
      // Semantic DOM anchors, never viewport coordinates or a click-blocking overlay.
      const matches = targetSelector(state, nextContext).split(',').flatMap((selector) => [...root.querySelectorAll<HTMLElement>(selector.trim())]);
      const next = matches.find((item) => item.getClientRects().length > 0) ?? null;
      if (target.current !== next) {
        target.current?.removeAttribute('data-tutorial-focus');
        target.current = next;
        next?.setAttribute('data-tutorial-focus', 'true');
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); target.current?.removeAttribute('data-tutorial-focus'); target.current = null; };
  }, [state, active]);

  useEffect(() => {
    const element = note.current;
    if (!element || !visible) return;
    const root = element.parentElement!;
    const measure = () => root.style.setProperty('--tutorial-note-height', `${element.offsetHeight + 12}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); root.style.removeProperty('--tutorial-note-height'); };
  }, [visible, step, context, hint, freeNotice]);

  if (!visible) return null;
  let title = '';
  let body = '';
  let action = '找到这一步 ↓';
  if (freeNotice) {
    title = '这张便签写到这里';
    body = '从今天开始，你可以自由安排幸存者。人手、物资与门外的事都不会替你等。日志会留下已经发生的结果。';
    action = '收起便签';
  } else if (hint) {
    [title, body] = HINTS[hint];
    action = '记住了';
  } else if (context === 'interrupt') {
    title = '先给眼前的事一个答复';
    body = '这也是长街里真实发生的事。处理完，再接着看便签；引导不会替你选。';
  } else if (step === 'INTRO') {
    title = '第 1 天';
    body = '停电已经持续了三天。这里暂时还能住人，但食物不会自己出现。先看看手里还剩什么。';
    action = '先清点东西';
  } else if (step === 'RESOURCE_OVERVIEW') {
    title = '先看口粮和材料';
    body = '口粮维持大家活下去，材料用于修整据点。眼下先记住这两样，再给幸存者安排去处。';
    action = '去安排人手';
  } else if (step === 'ASSIGN_SURVIVOR') {
    title = '给一个人记下今天的工作';
    body = context === 'jobs'
      ? '每天每人只能承担一个主要岗位。宿营屋还能开伙，可以安排炊事，也可以先让人休息。点岗位才会记下。'
      : '翻开一名幸存者，给他安排屋内工作或休息。这次真的会写进今天的名单，不只是看说明。';
  } else if (step === 'SEND_EXPEDITION') {
    title = '让另一人去街外看看';
    if (context === 'route') action = '找到记路按钮 ↓';
    body = context === 'expedition'
      ? '人已经在路上。读清现场，再决定深入、谨慎搜寻或撤回；撤回同样是完整选择。'
      : context === 'route'
        ? '先看风险和能翻到的物资，再把路线记下。标出的路眼下风险较低，但不保证平安。'
        : context === 'people' && hasTutorialRoute(state)
          ? '路线已经记下。点「这张名单就这么定」才会真正派人出发；空着的人会休息，出发后不能重写今天。'
          : '翻开另一名幸存者，点「探索」再选路。名单定下前都能改；写在同一路线的人会结伴出发。';
  } else if (step === 'END_DAY') {
    title = '现在由你结束白天';
    body = '探索已经结束。再看一眼饭锅和仓房，点「结束白天」会结算今天的工作与晚饭，然后进入夜晚。';
  } else if (step === 'FIRST_NIGHT') {
    title = context === 'dawn' ? '把这一夜带到明天' : '门外的事，没有标准答案';
    body = context === 'dawn'
      ? '这一夜结束了。清点之后翻到第 2 天，再去日志看看人手、物资和昨夜的选择。'
      : '看清代价，再自己决定。眼前的得失会记下，有些决定会留下后话，不会马上有答案。';
  } else if (step === 'OPEN_LOG') {
    title = '翻开日志，看昨天留下了什么';
    body = '谁干了活、谁去了街外、口粮花在哪里、昨夜选了什么，都记在同一本日志里。';
    action = '打开日志';
  }

  const follow = () => {
    if (freeNotice || hint) return onCommit(dismissTutorialNotice(state, hint));
    if (context !== 'interrupt' && (step === 'INTRO' || step === 'RESOURCE_OVERVIEW')) {
      onCommit(acknowledgeTutorialPage(state));
      onNavigate(step === 'RESOURCE_OVERVIEW' ? 'survivors' : 'buildings');
      window.scrollTo(0, 0);
      return;
    }
    if (step === 'OPEN_LOG' && context !== 'interrupt') return onNavigate('records');
    if (context === 'home' && ['ASSIGN_SURVIVOR', 'SEND_EXPEDITION'].includes(step ?? '')) return onNavigate('survivors');
    const anchor = target.current;
    if (anchor) {
      // Old WebViews lack scroll-margin; derive the offset from the actual note, not coordinates.
      const offset = (note.current?.getBoundingClientRect().height ?? 0) + 12;
      window.scrollTo(0, Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - offset));
    }
  };

  return <aside ref={note} className="v1-tutorial-note" aria-label={active ? '新手引导' : '长街便签'} data-stage={step}>
    <div className="v1-tutorial-note__copy" aria-live="polite"><span>{active ? '开局便签' : '长街便签'}</span><h2>{title}</h2><p>{body}</p></div>
    <div className="v1-tutorial-note__actions"><button onClick={follow}>{action}</button>{active && <button className="v1-tutorial-skip" onClick={() => onCommit(skipTutorial(state))}>跳过引导</button>}</div>
  </aside>;
}
