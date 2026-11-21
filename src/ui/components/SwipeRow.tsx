import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import styles from './SwipeRow.module.css';
import { cx } from './cx';

export interface SwipeAction {
  label: string;
  tone?: 'neutral' | 'accent' | 'destructive';
  onAction: () => void;
}

interface SwipeRowProps {
  actions: readonly SwipeAction[];
  children: ReactNode;
}

const ACTION_WIDTH = 76;

/** Row that reveals actions with a left swipe, like iOS Mail. */
export function SwipeRow({ actions, children }: SwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; base: number; locked: 'x' | 'y' | null } | null>(null);
  const max = actions.length * ACTION_WIDTH;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    gesture.current = { x: e.clientX, y: e.clientY, base: offset, locked: null };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.locked === 'x') {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (g.locked !== 'x') return;
    let next = g.base + dx;
    if (next > 0) next = 0;
    if (next < -max) next = -max - Math.sqrt(-max - next) * 3;
    setOffset(next);
  };
  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g || g.locked !== 'x') {
      if (offset !== 0 && g && g.locked === null) setOffset(0);
      return;
    }
    setOffset(offset < -max / 2 ? -max : 0);
  };

  return (
    <div className={cx(styles.wrap, dragging && styles.dragging)}>
      <div className={styles.actions} aria-hidden={offset === 0}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={styles.action}
            data-tone={a.tone ?? 'neutral'}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => {
              setOffset(0);
              a.onAction();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className={styles.content}
        style={{ '--swipe-x': `${offset}px` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
