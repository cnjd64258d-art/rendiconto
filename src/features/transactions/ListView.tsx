import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, type RefObject } from 'react';
import type { Group } from '../../core/views';
import type { Transaction } from '../../core/types';
import { GroupHeader, TransactionRow, type Lookups } from './TransactionRow';

type Item = { type: 'header'; group: Group } | { type: 'row'; t: Transaction; key: string };

/** Virtualised list, grouped like Notion's list layout. Fluid with 5,000+ rows. */
export function ListView({ groups, lookups, scrollRef, showHeaders }: { groups: Group[]; lookups: Lookups; scrollRef: RefObject<HTMLDivElement | null>; showHeaders: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const group of groups) {
      if (showHeaders) out.push({ type: 'header', group });
      // A row can appear in several groups (tags), so the key includes the group.
      for (const t of group.items) out.push({ type: 'row', t, key: `${group.key}/${t.id}` });
    }
    return out;
  }, [groups, showHeaders]);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer state is read during render by design
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.type === 'header' ? 48 : 60),
    getItemKey: (i) => {
      const item = items[i];
      return item?.type === 'header' ? `h-${item.group.key}` : (item?.key ?? i);
    },
    overscan: 10,
    // Offset of the list inside the scroll container (tabs and toolbar above it).
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((v) => {
        const item = items[v.index];
        if (!item) return null;
        return (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
          >
            {item.type === 'header' ? (
              <GroupHeader label={item.group.label} emoji={item.group.emoji} spentCents={item.group.spentCents} incomeCents={item.group.incomeCents} count={item.group.count} />
            ) : (
              <TransactionRow t={item.t} lookups={lookups} />
            )}
          </div>
        );
      })}
    </div>
  );
}
