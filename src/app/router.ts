import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router. GitHub Pages has no SPA fallback, and "#/…" URLs keep
 * working offline and from the Home Screen.
 */
export type Route =
  | { name: 'today' }
  | { name: 'transactions' }
  | { name: 'analysis' }
  | { name: 'review'; year: number }
  | { name: 'budget' }
  | { name: 'settings' }
  | { name: 'backup' }
  | { name: 'import' }
  | { name: 'categories' }
  | { name: 'methods' }
  | { name: 'recurring' }
  | { name: 'plans' }
  | { name: 'shared' }
  | { name: 'pin' }
  | { name: 'design' }
  | { name: 'notFound'; path: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0]?.replace(/\/+$/, '') || '/';
  const review = /^\/analisi\/anno\/(\d{4})$/.exec(path);
  if (review) return { name: 'review', year: Number(review[1]) };
  switch (path) {
    case '/':
      return { name: 'today' };
    case '/transazioni':
      return { name: 'transactions' };
    case '/analisi':
      return { name: 'analysis' };
    case '/budget':
      return { name: 'budget' };
    case '/impostazioni':
      return { name: 'settings' };
    case '/impostazioni/backup':
      return { name: 'backup' };
    case '/impostazioni/import':
      return { name: 'import' };
    case '/impostazioni/categorie':
      return { name: 'categories' };
    case '/impostazioni/metodi':
      return { name: 'methods' };
    case '/impostazioni/ricorrenti':
      return { name: 'recurring' };
    case '/impostazioni/rate':
      return { name: 'plans' };
    case '/impostazioni/condivise':
      return { name: 'shared' };
    case '/impostazioni/pin':
      return { name: 'pin' };
    case '/design':
      return { name: 'design' };
    default:
      return { name: 'notFound', path };
  }
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => '');
}

export function navigate(path: string): void {
  window.location.hash = path;
}

/** Reads and removes a one-shot query flag such as "?add=1" (manifest shortcuts). */
export function consumeLaunchFlag(name: string): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get(name) !== '1') return false;
  url.searchParams.delete(name);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return true;
}
