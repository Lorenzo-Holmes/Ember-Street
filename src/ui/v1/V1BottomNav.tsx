import './integration.css';

export type V1NavTarget = 'buildings' | 'survivors' | 'explore' | 'records';

interface V1BottomNavProps {
  active: V1NavTarget;
  onNavigate: (target: V1NavTarget) => void;
}

export default function V1BottomNav({ active, onNavigate }: V1BottomNavProps) {
  const items: Array<[V1NavTarget, string]> = [
    ['buildings', '建筑'],
    ['survivors', '幸存者'],
    ['explore', '探索'],
    ['records', '日志'],
  ];
  return (
    <nav className="v1-bottom-nav" aria-label="主导航">
      {items.map(([id, label]) => (
        <button key={id} data-tutorial-nav={id} className={active === id ? 'active' : ''} onClick={() => onNavigate(id)}>{label}</button>
      ))}
    </nav>
  );
}
