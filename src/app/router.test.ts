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
    ['#/boh', 'notFound'],
  ])('%j → %s', (hash, name) => {
    expect(parseRoute(hash).name).toBe(name);
  });
});
