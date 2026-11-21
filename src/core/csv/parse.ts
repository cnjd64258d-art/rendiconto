/**
 * RFC 4180 CSV parser that also tolerates real-world files:
 * BOM, CRLF/LF/CR line ends, quoted fields with commas, newlines and "" escapes,
 * typographic quotes/apostrophes inside text, ";" or tab delimiters, trailing empty lines.
 */
export type Delimiter = ',' | ';' | '\t';

export interface ParsedCsv {
  delimiter: Delimiter;
  header: string[];
  /** Data rows; `line` is the 1-based line number in the file (header = 1). */
  rows: { line: number; cells: string[] }[];
}

export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/, 1)[0] ?? '';
  const count = (d: string) => firstLine.split(d).length - 1;
  const candidates: Delimiter[] = [',', ';', '\t'];
  return candidates.reduce((best, d) => (count(d) > count(best) ? d : best), ',' as Delimiter);
}

export function parseCsv(input: string, delimiter: Delimiter = detectDelimiter(input)): ParsedCsv {
  const text = input.replace(/^\uFEFF/, '');
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let fieldStarted = false;

  const endField = () => {
    cells.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    // Skip fully empty lines (e.g. trailing newline).
    if (!(cells.length === 1 && cells[0] === '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (field !== '' || cells.length > 0 || fieldStarted) endRecord();

  const [head, ...rest] = records;
  return {
    delimiter,
    header: (head?.cells ?? []).map((h) => h.trim()),
    rows: rest,
  };
}
