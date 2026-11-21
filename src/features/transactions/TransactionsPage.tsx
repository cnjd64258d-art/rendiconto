import { useMemo, useRef, useState } from 'react';
import { openNewTransaction } from '../../app/editor';
import { monthOf, today } from '../../core/dates';
import { formatCents } from '../../core/format';
import { summarize } from '../../core/transactions';
import type { SavedView } from '../../core/types';
import {
  DEFAULT_VIEW,
  EMPTY_FILTER,
  activeFilterCount,
  boardColumns,
  filterTransactions,
  groupTransactions,
  makeCtx,
  normalizeConfig,
  resolvePeriod,
  sameConfig,
  sortTransactions,
  tagsByUse,
  type SearchCache,
} from '../../core/views';
import { useCategories, useCategoryGroups, usePaymentMethods, useSavedViews, useTransactions } from '../../db/hooks';
import { deleteView, saveView } from '../../db/views';
import { Button, ConfirmSheet, EmptyState, IconButton, Page, cx, showToast } from '../../ui/components';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { FilterSheet } from './FilterSheet';
import { ListView } from './ListView';
import { OptionsSheet } from './OptionsSheet';
import { SaveViewSheet } from './SaveViewSheet';
import { TableView } from './TableView';
import { useLookups } from './useLookups';
import { setViewState, updateConfig, useViewState } from './viewState';
import styles from './TransactionsPage.module.css';

function LayoutIcon({ layout }: { layout: 'list' | 'table' | 'board' | 'calendar' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className={styles.layoutIcon} width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      {layout === 'list' && <path {...common} d="M4 6h14M4 11h14M4 16h14" />}
      {layout === 'table' && (
        <>
          <rect {...common} x="3" y="4" width="16" height="14" rx="2" />
          <path {...common} d="M3 9h16M9 9v9" />
        </>
      )}
      {layout === 'board' && (
        <>
          <rect {...common} x="3" y="4" width="5" height="14" rx="1.5" />
          <rect {...common} x="10" y="4" width="5" height="9" rx="1.5" />
          <path {...common} d="M17 4h2v11h-2" />
        </>
      )}
      {layout === 'calendar' && (
        <>
          <rect {...common} x="3" y="5" width="16" height="14" rx="2" />
          <path {...common} d="M3 9.5h16M7.5 3v4M14.5 3v4" />
        </>
      )}
    </svg>
  );
}

export function TransactionsPage() {
  const transactions = useTransactions();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const methods = usePaymentMethods();
  const views = useSavedViews();
  const lookups = useLookups();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { viewId, config } = useViewState();
  const [sheet, setSheet] = useState<'filters' | 'options' | 'save' | 'edit' | null>(null);
  const [deleting, setDeleting] = useState<SavedView | null>(null);
  const todayISO = today();

  const ctx = useMemo(() => (categories && groups && methods ? makeCtx(categories, groups, methods) : null), [categories, groups, methods]);
  // One search cache per data snapshot: typing only re-tests the rows, it does not rebuild their text.
  const cache = useMemo<SearchCache>(() => new Map(), [transactions, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => (transactions && ctx ? filterTransactions(transactions, config.filter, ctx, todayISO, cache) : []),
    [transactions, ctx, config.filter, todayISO, cache],
  );
  const sorted = useMemo(() => (ctx ? sortTransactions(filtered, config.sort, ctx) : []), [filtered, config.sort, ctx]);
  const grouped = useMemo(() => {
    if (!ctx) return [];
    if (config.layout === 'board') {
      const showEmpty = activeFilterCount(config.filter) === 0 && !config.filter.text.trim();
      return boardColumns(sorted, config.boardBy, ctx, todayISO, showEmpty);
    }
    return groupTransactions(sorted, config.groupBy, ctx, todayISO);
  }, [sorted, config.layout, config.boardBy, config.groupBy, config.filter, ctx, todayISO]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const tags = useMemo(() => tagsByUse(transactions ?? []), [transactions]);

  const activeView = views?.find((v) => v.id === viewId) ?? null;
  const baseConfig = activeView ? normalizeConfig(activeView) : DEFAULT_VIEW;
  const dirty = !sameConfig(config, baseConfig);
  const filterCount = activeFilterCount(config.filter);

  const range = resolvePeriod(config.filter, todayISO);
  const calendarStart = range && range.to < todayISO ? monthOf(range.to) : monthOf(todayISO);

  const empty = transactions !== undefined && transactions.length === 0;
  const noResults = !empty && transactions !== undefined && filtered.length === 0;

  const selectView = (view: SavedView | null) => {
    if (view && view.id === viewId) {
      setSheet('edit');
      return;
    }
    setViewState({ viewId: view?.id ?? null, config: view ? normalizeConfig(view) : DEFAULT_VIEW });
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <Page
      title={activeView ? activeView.name : 'Transazioni'}
      scrollRef={scrollRef}
      trailing={
        <IconButton label="Layout, ordinamento e raggruppamento" onClick={() => setSheet('options')}>
          <LayoutIcon layout={config.layout} />
        </IconButton>
      }
      footer={
        empty || !transactions ? undefined : (
          <>
            <span>
              {summary.count.toLocaleString('it-IT')} {summary.count === 1 ? 'transazione' : 'transazioni'}
            </span>
            <span>
              Uscite {formatCents(summary.spentCents)}
              {summary.incomeCents > 0 ? ` · Entrate ${formatCents(summary.incomeCents)}` : ''}
            </span>
          </>
        )
      }
    >
      <nav className={styles.tabs} aria-label="Viste">
        <button type="button" className={cx(styles.tab, viewId === null && styles.tabActive)} aria-current={viewId === null ? 'page' : undefined} onClick={() => selectView(null)}>
          <span aria-hidden="true">📋</span> Tutte
        </button>
        {views?.map((v) => (
          <button
            key={v.id}
            type="button"
            className={cx(styles.tab, viewId === v.id && styles.tabActive)}
            aria-current={viewId === v.id ? 'page' : undefined}
            onClick={() => selectView(v)}
          >
            <span aria-hidden="true">{v.emoji}</span> {v.name}
          </button>
        ))}
        <button type="button" className={styles.tabAdd} aria-label="Salva come nuova vista" onClick={() => setSheet('save')}>
          ＋
        </button>
      </nav>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className="visually-hidden">Cerca</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Cerca descrizione, nota, tag, importo…"
            enterKeyHint="search"
            autoComplete="off"
            value={config.filter.text}
            onChange={(e) => updateConfig((c) => ({ ...c, filter: { ...c.filter, text: e.target.value } }))}
          />
        </label>
        <button type="button" className={cx(styles.filterButton, filterCount > 0 && styles.filterOn)} onClick={() => setSheet('filters')}>
          Filtri{filterCount > 0 ? ` · ${filterCount}` : ''}
        </button>
      </div>

      {dirty && (
        <div className={styles.dirty}>
          {activeView ? (
            <>
              <span>Vista modificata</span>
              <button type="button" onClick={() => setViewState({ viewId, config: baseConfig })}>
                Ripristina
              </button>
              <button
                type="button"
                className={styles.dirtyPrimary}
                onClick={async () => {
                  await saveView({ ...activeView, layout: config.layout, filter: config.filter, sort: [config.sort], groupBy: config.groupBy, boardBy: config.boardBy, columns: config.columns });
                  showToast('Vista aggiornata');
                }}
              >
                Salva
              </button>
            </>
          ) : (
            <>
              <span>{filterCount > 0 || config.filter.text.trim() ? 'Filtri attivi' : 'Vista modificata'}</span>
              <button type="button" onClick={() => setViewState({ viewId: null, config: DEFAULT_VIEW })}>
                Ripristina
              </button>
              <button type="button" className={styles.dirtyPrimary} onClick={() => setSheet('save')}>
                Salva come vista
              </button>
            </>
          )}
        </div>
      )}

      {empty && (
        <EmptyState
          emoji="🗂️"
          title="Ancora nessuna transazione"
          action={
            <Button variant="secondary" onClick={openNewTransaction}>
              Aggiungi la prima
            </Button>
          }
        >
          Tocca ＋ per registrare una spesa in pochi secondi, oppure carica i dati di esempio dalle Impostazioni.
        </EmptyState>
      )}
      {noResults && config.layout !== 'calendar' && (
        <EmptyState
          emoji="🔍"
          title="Nessun risultato"
          action={
            <Button variant="secondary" onClick={() => updateConfig({ filter: EMPTY_FILTER })}>
              Togli filtri e ricerca
            </Button>
          }
        >
          Nessuna transazione corrisponde ai filtri di questa vista.
        </EmptyState>
      )}

      {lookups && !empty && (
        <>
          {config.layout === 'list' && !noResults && <ListView groups={grouped} lookups={lookups} scrollRef={scrollRef} showHeaders={config.groupBy !== 'none'} />}
          {config.layout === 'table' && !noResults && (
            <TableView
              groups={grouped}
              showHeaders={config.groupBy !== 'none'}
              columns={config.columns}
              lookups={lookups}
              scrollRef={scrollRef}
              sort={config.sort}
              onSort={(sort) => updateConfig({ sort })}
            />
          )}
          {config.layout === 'board' && <BoardView columns={grouped} lookups={lookups} by={config.boardBy} />}
          {config.layout === 'calendar' && <CalendarView key={calendarStart} transactions={filtered} lookups={lookups} initialMonth={calendarStart} todayISO={todayISO} />}
        </>
      )}

      {categories && groups && methods && (
        <FilterSheet
          open={sheet === 'filters'}
          onClose={() => setSheet(null)}
          filter={config.filter}
          onChange={(filter) => updateConfig({ filter })}
          categories={categories}
          groups={groups}
          methods={methods.filter((m) => !m.archived || config.filter.methodIds.includes(m.id))}
          tags={tags}
        />
      )}
      <OptionsSheet open={sheet === 'options'} onClose={() => setSheet(null)} config={config} onChange={(c) => updateConfig(() => c)} />
      <SaveViewSheet
        open={sheet === 'save' || sheet === 'edit'}
        onClose={() => setSheet(null)}
        config={config}
        views={views ?? []}
        editing={sheet === 'edit' ? activeView : null}
        onSaved={(v) => {
          setSheet(null);
          setViewState({ viewId: v.id, config: normalizeConfig(v) });
        }}
        onDelete={(v) => {
          setSheet(null);
          setDeleting(v);
        }}
      />
      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        emoji="🗑️"
        title={`Eliminare la vista «${deleting?.name ?? ''}»?`}
        confirmLabel="Elimina vista"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteView(deleting.id);
          setDeleting(null);
          setViewState({ viewId: null, config: DEFAULT_VIEW });
          showToast('Vista eliminata');
        }}
      >
        Le transazioni non vengono toccate: sparisce solo questa vista.
      </ConfirmSheet>
    </Page>
  );
}
