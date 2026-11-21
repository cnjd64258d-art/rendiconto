import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', 'today'],
    ['#/', 'today'],
    ['#/transazioni', 'transactions'],
    ['#/transazioni/?vista=abc', 'transactions'],
    ['#/analisi', 'analysis'],
    ['#/budget', 'budget'],
    ['#/impostazioni', 'settings'],
    ['#/design', 'design'],
    ['#/impostazioni/backup', 'backup'],
    ['#/impostazioni/import', 'import'],
    ['#/impostazioni/categorie', 'categories'],
    ['#/impostazioni/metodi', 'methods'],
    ['#/impostazioni/ricorrenti', 'recurring'],
    ['#/boh', 'notFound'],
  ])('%j → %s', (hash, name) => {
    expect(parseRoute(hash).name).toBe(name);
  });
});
