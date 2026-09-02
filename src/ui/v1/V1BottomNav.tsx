import type { V1NavTarget } from './HomeBaseView';

interface V1BottomNavProps {
  active: V1NavTarget;
  onNavigate: (target: V1NavTarget) => void;
}

export default function V1BottomNav({ active, onNavigate }: V1BottomNavProps) {
  const items: Array<[V1NavTarget, string]> = [
    ['home', '据点'],
    ['explore', '探索'],
    ['survivors', '幸存者'],
    ['records', '记录'],
  ];
  return (
    <nav className="v1-bottom-nav" aria-label="主导航">
      {items.map(([id, label]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onNavigate(id)}>{label}</button>
      ))}
    </nav>
  );
}
