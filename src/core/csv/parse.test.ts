import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './parse';

describe('parseCsv', () => {
  it('handles BOM, CRLF and a trailing newline', () => {
    const r = parseCsv('﻿data,descrizione\r\n2026-01-01,Caffè\r\n');
    expect(r.header).toEqual(['data', 'descrizione']);
    expect(r.rows).toEqual([{ line: 2, cells: ['2026-01-01', 'Caffè'] }]);
  });

  it('handles quotes, commas, escaped quotes and newlines inside fields', () => {
    const r = parseCsv('a,b,c\n"Pranzo, cena","Il ""Bar""","riga 1\nriga 2"\nx,y,z\n');
    expect(r.rows[0]?.cells).toEqual(['Pranzo, cena', 'Il "Bar"', 'riga 1\nriga 2']);
    expect(r.rows[1]).toEqual({ line: 4, cells: ['x', 'y', 'z'] });
  });

  it('keeps typographic quotes and apostrophes as text', () => {
    const r = parseCsv('a,b\nMcDonald’s,“Cena” d’asporto\n');
    expect(r.rows[0]?.cells).toEqual(['McDonald’s', '“Cena” d’asporto']);
  });

  it('supports old Mac line ends and empty fields', () => {
    const r = parseCsv('a,b,c\r1,,3\r\r4,5,\r');
    expect(r.rows.map((x) => x.cells)).toEqual([
      ['1', '', '3'],
      ['4', '5', ''],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('data;descrizione;importo\n')).toBe(';');
    expect(detectDelimiter('data\tdescrizione\n')).toBe('\t');
    expect(parseCsv('a;b\n"1;2";3\n').rows[0]?.cells).toEqual(['1;2', '3']);
  });
});
