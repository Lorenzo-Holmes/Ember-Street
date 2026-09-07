import { useState, type ReactNode } from 'react';
import type { GameState } from '../../game/types';

type ShellProps = {
  children: ReactNode;
  className?: string;
  label?: string;
};

const join = (...parts: Array<string | undefined | false>) => parts.filter(Boolean).join(' ');

export function AppShell({ children, className }: Pick<ShellProps, 'children' | 'className'>) {
  return <div className={join('v2-app-shell', className)}>{children}</div>;
}

export function SceneShell({ children, className, label }: ShellProps) {
  return <main className={join('v2-shell', 'v2-shell--scene', className)} aria-label={label}>{children}</main>;
}

export function BoardShell({ children, className, label }: ShellProps) {
  return <main className={join('v2-shell', 'v2-shell--board', className)} aria-label={label}>{children}</main>;
}

export function StoryShell({ children, className, label }: ShellProps) {
  return <main className={join('v2-shell', 'v2-shell--story', className)} aria-label={label}>{children}</main>;
}

export function BookShell({ children, className, label }: ShellProps) {
  return <main className={join('v2-shell', 'v2-shell--book', className)} aria-label={label}>{children}</main>;
}

export function PaperPanel({ children, className }: Pick<ShellProps, 'children' | 'className'>) {
  return <section className={join('v2-paper-panel', className)}>{children}</section>;
}

export function PinnedNote({ children, tone = 'neutral', className }: Pick<ShellProps, 'children' | 'className'> & { tone?: 'neutral' | 'warning' | 'new' }) {
  return <aside className={join('v2-pinned-note', `v2-pinned-note--${tone}`, className)}>{children}</aside>;
}

export function PageBackHeader({ title, eyebrow, onBack }: { title: string; eyebrow?: string; onBack: () => void }) {
  return <header className="v2-back-header">
    <button onClick={onBack} aria-label={`返回${title}`}>←</button>
    <div>{eyebrow ? <span>{eyebrow}</span> : null}<strong>{title}</strong></div>
  </header>;
}

const PHASE_LABEL: Record<GameState['phase'], string> = {
  street: '白天',
  assignment: '白天',
  expedition: '外出',
  dusk: '黄昏',
  night: '夜晚',
  'night-summary': '深夜',
  summary: '清晨',
  dawn: '清晨',
  ending: '终章',
};

function ResourceDrawer({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ['口粮', state.inventory.ration],
    ['药品', state.inventory.medicine],
    ['电力', state.inventory.power],
    ['材料', state.inventory.materials],
    ['零件', state.inventory.parts],
    ['希望', state.hope],
  ] as const;
  return <div className={`v2-resource-drawer ${open ? 'is-open' : ''}`}>
    <button className="v2-resource-drawer__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? '收起物资' : '查看物资'}
    </button>
    {open ? <div className="v2-resource-drawer__sheet" role="group" aria-label="当前物资">
      {rows.map(([label, value]) => <p key={label}><span>{label}</span><b>{value}</b></p>)}
    </div> : null}
  </div>;
}

export function TopStatusBar({ state, detail, resources = true }: { state: GameState; detail?: string; resources?: boolean }) {
  const phase = PHASE_LABEL[state.phase] ?? '白天';
  return <header className="v2-top-status">
    <div className="v2-top-status__day"><span>DAY</span><strong>{state.day}</strong><small>/30</small></div>
    <div className="v2-top-status__phase"><b>{phase}</b><small>{detail ?? (state.day === 29 ? '最后一个可操作日' : state.forecast.detail)}</small></div>
    {resources ? <ResourceDrawer state={state}/> : null}
  </header>;
}
