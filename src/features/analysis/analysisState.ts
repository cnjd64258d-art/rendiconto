import { useSyncExternalStore } from 'react';
import { monthOf, today, yearOf, type YearMonth } from '../../core/dates';
import type { Basis } from '../../core/analysis';

export type PeriodMode = 'month' | 'year' | 'custom';

/** Analysis selection; kept outside React so it survives switching tabs and opening "Tira una linea". */
export interface AnalysisState {
  mode: PeriodMode;
  month: YearMonth;
  year: number;
  from: YearMonth;
  to: YearMonth;
  basis: Basis;
}

const now = monthOf(today());
let state: AnalysisState = { mode: 'year', month: now, year: yearOf(now), from: `${yearOf(now)}-01`, to: now, basis: 'accrual' };
const listeners = new Set<() => void>();

export function setAnalysis(patch: Partial<AnalysisState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useAnalysis(): AnalysisState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
