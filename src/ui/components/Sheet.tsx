import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Sheet.module.css';
import { cx } from './cx';
import { useVisualViewport } from './useVisualViewport';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Accessible name when the title is not plain text. */
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}

const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.6; // px per ms

/** iOS-style bottom sheet with a grabber and drag-to-dismiss. */
export function Sheet({ open, onClose, title, label, leading, trailing, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewport = useVisualViewport();

  // Mount as soon as it opens (state adjusted during render, no extra effect).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      // Two frames so the closed position is painted before sliding up.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const t = window.setTimeout(() => {
      setMounted(false);
      setEntered(false);
      setDragY(0);
    }, 450);
    return () => window.clearTimeout(t);
  }, [open]);

  const visible = open && entered;

  // The rest of the app is inert while the sheet is open (focus stays inside).
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root || !open) return;
    root.inert = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.inert = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Header buttons keep working: only drag from empty areas.
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const dy = e.clientY - d.startY;
    // Rubber band when pulling up.
    setDragY(dy >= 0 ? dy : -Math.sqrt(-dy) * 2);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const dy = d.lastY - d.startY;
    if (dy > CLOSE_DISTANCE || d.velocity > CLOSE_VELOCITY) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  const style = {
    '--drag-y': `${dragY}px`,
    '--keyboard-inset': `${viewport.keyboardInset}px`,
    '--viewport-height': `${viewport.height}px`,
  } as CSSProperties;

  return createPortal(
    <div
      className={cx(styles.root, visible && styles.visible, dragging && styles.dragging, viewport.keyboardInset > 0 && styles.keyboardOpen)}
      style={style}
    >
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div
          className={styles.grabber}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className={styles.handle} aria-hidden="true" />
          {(title !== undefined || leading !== undefined || trailing !== undefined) && (
            <div className={styles.header}>
              <div className={styles.leading}>{leading}</div>
              <div className={styles.title}>{title}</div>
              <div className={styles.trailing}>{trailing}</div>
            </div>
          )}
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
