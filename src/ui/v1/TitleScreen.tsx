import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GAME_SAVE_EVENT, inspectGameSave } from '../../game/storage';
import { continueSavedSession, savedDayLabel, startNewSession } from '../../game/sessionEntry';
import type { GameState } from '../../game/types';
import './title-screen.css';

export function NotebookDialog({ title, children, onClose }: {
  title: string; children: ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const nativeDialog = typeof element.showModal === 'function';
    let shade: HTMLDivElement | null = null;
    if (nativeDialog) element.showModal();
    else {
      element.classList.add('v1-menu-sheet--fallback');
      element.setAttribute('open', '');
      element.setAttribute('aria-modal', 'true');
      shade = document.createElement('div');
      shade.className = 'v1-menu-fallback-shade';
      shade.setAttribute('aria-hidden', 'true');
      document.body.appendChild(shade);
      element.querySelector<HTMLButtonElement>('[autofocus], button')?.focus();
    }
    return () => { if (nativeDialog) element.close(); else element.removeAttribute('open'); shade?.remove(); };
  }, []);
  return <dialog className="v1-menu-sheet" ref={dialog} aria-label={title}
    onKeyDown={(event) => {
      if (!event.currentTarget.classList.contains('v1-menu-sheet--fallback')) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <h2>{title}</h2>{children}
  </dialog>;
}

export function HowToPlay() {
  return <div className="v1-menu-guide">
    <p>在这条街留下来。分配有限的人手和物资，尽量让更多人活到最后。</p>
    <ol>
      <li><strong>白天，安排人手</strong><p>在“幸存者”页分配外出、修补、诊疗、守望、广播、炊事和休息。外出的人还要选好去处。</p></li>
      <li><strong>黄昏，再清点一次</strong><p>检查口粮、伤员和防线。准备妥当后再入夜；当晚的人手安排将不能更改。</p></li>
      <li><strong>夜里，作出选择</strong><p>留意每个办法的代价与风险。部分行动要掷骰子，结果不一定如愿。</p></li>
      <li><strong>天亮，把损失记下</strong><p>清点回来的人与剩下的东西，再安排新的一天。</p></li>
    </ol>
    <p className="v1-menu-footnote">操作后自动保存在当前浏览器。可随时从“菜单”返回封面；清除浏览器数据会丢失进度。</p>
  </div>;
}

export default function TitleScreen({ onEnter, initialPanel = 'main' }: {
  onEnter: (state: GameState) => void; initialPanel?: 'main' | 'restart';
}) {
  const [save, setSave] = useState(inspectGameSave);
  const [panel, setPanel] = useState<'main' | 'help' | 'restart'>(initialPanel);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    heading.current?.focus({ preventScroll: true });
    const refresh = () => setSave(inspectGameSave());
    window.addEventListener('storage', refresh);
    window.addEventListener(GAME_SAVE_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(GAME_SAVE_EVENT, refresh);
    };
  }, []);

  const enter = (result: ReturnType<typeof startNewSession>) => {
    if (result.kind === 'ready') return onEnter(result.state);
    setSave(inspectGameSave());
    if (result.kind === 'confirm-restart') setPanel('restart');
    else setError(result.message);
  };
  const requestNew = () => {
    setError('');
    enter(startNewSession());
  };
  const closePanel = () => { setPanel('main'); setError(''); };

  return <main className="v1-title-screen" aria-label="游戏开始界面">
    <div className="v1-title-book">
      <header className="v1-title-heading">
        <span className="v1-title-kicker">长街生存手记</span>
        <h1 ref={heading} tabIndex={-1}>余烬长街</h1>
        <span className="v1-title-rule" aria-hidden="true"/>
      </header>
      <nav className="v1-title-actions" aria-label="开始菜单">
        {save.kind === 'saved' ? <>
          <button className="v1-title-primary" onClick={() => { setError(''); enter(continueSavedSession()); }}>继续游戏</button>
          <p className="v1-title-save">{savedDayLabel(save.state)}</p>
          <button onClick={requestNew}>重新开始</button>
        </> : <>
          <button className="v1-title-primary" onClick={requestNew} disabled={save.kind === 'unavailable'}>
            {save.kind === 'unreadable' ? '重新开始' : '开始游戏'}
          </button>
          {save.kind === 'unreadable' && <p className="v1-title-save">旧记录暂时读不出来，尚未清除。</p>}
        </>}
        <button onClick={() => { setError(''); setPanel('help'); }}>玩法说明</button>
      </nav>
      <p className="v1-title-bottom">自动保存 · 本机记录</p>
    </div>
    {panel === 'main' && (error || save.kind === 'unavailable') && <p className="v1-title-error" role="alert">{error || '无法读取浏览器存档。请允许本站保存数据后重试。'}</p>}
    {panel === 'help' && <NotebookDialog title="玩法说明" onClose={closePanel}>
      <HowToPlay/><button className="v1-menu-action" onClick={closePanel} autoFocus>返回封面</button>
    </NotebookDialog>}
    {panel === 'restart' && <NotebookDialog title="从第一天重新开始？" onClose={closePanel}>
      <p>{save.kind === 'saved' ? `当前进度：${savedDayLabel(save.state)}。` : '浏览器里仍有一份旧记录。'}</p>
      <p>重新开始会覆盖这次游戏的进度，无法撤回。已收集的结局会保留。</p>
      {error && <p className="v1-menu-error" role="alert">{error}</p>}
      <div className="v1-menu-confirm-actions">
        <button className="v1-menu-action" onClick={closePanel} autoFocus>保留当前进度</button>
        <button className="v1-menu-action v1-menu-action--danger" onClick={() => enter(startNewSession(true))}>确认重新开始</button>
      </div>
    </NotebookDialog>}
  </main>;
}

export function PlayerMenu({ state, onReturnToTitle }: { state: GameState; onReturnToTitle: () => void }) {
  const [panel, setPanel] = useState<'menu' | 'help' | null>(null);
  return <>
    <button className="v1-player-menu" onClick={() => setPanel('menu')} aria-haspopup="dialog">菜单</button>
    {panel && <NotebookDialog title={panel === 'help' ? '玩法说明' : '合上手记，歇一会儿'} onClose={() => setPanel(null)}>
      {panel === 'help' ? <>
        <HowToPlay/><button className="v1-menu-action" onClick={() => setPanel('menu')} autoFocus>返回菜单</button>
      </> : <>
        <p className="v1-menu-day">{savedDayLabel(state)}</p>
        <nav className="v1-menu-actions" aria-label="游戏菜单">
          <button className="v1-menu-action" onClick={() => setPanel(null)} autoFocus>返回游戏</button>
          <button className="v1-menu-action" onClick={() => setPanel('help')}>玩法说明</button>
          <button className="v1-menu-action" onClick={onReturnToTitle}>返回封面</button>
        </nav>
        <p className="v1-menu-footnote">返回封面不会推进时间，也不会清除当前进度。</p>
      </>}
    </NotebookDialog>}
  </>;
}
