import type { ReactNode } from 'react';
import './notebook-page-transition.css';

export type NotebookTurnDirection = 'forward' | 'backward' | null;

export default function NotebookPageTransition({ children, direction, transitionId }: {
  children: ReactNode;
  direction: NotebookTurnDirection;
  transitionId: number;
}) {
  const directionClass = direction ? ` notebook-page-turn--${direction}` : '';
  return <div key={transitionId} className={`notebook-page-turn${directionClass}`}>
    <div className="notebook-page-turn__sheet">{children}</div>
  </div>;
}
