import { parse as parseCsv } from 'csv-parse/sync';
import { parseStringPromise } from 'xml2js';
import { getPath } from '@athena/core';

/**
 * Bridge for legacy systems that export CSV or XML. Records are parsed and
 * mapped into a consistent JSON shape so agents can reason over them.
 */

export type FieldMapping = Record<string, string>;

export interface NormalizeOptions {
  /** Map of output field -> source path (dotted for XML/JSON) */
  mapping?: FieldMapping;
  /** Fields to coerce to numbers */
  numeric?: string[];
  /** Fields to coerce to ISO dates */
  dates?: string[];
}

export function parseCsvRecords(input: string, delimiter = ','): Record<string, string>[] {
  return parseCsv(input, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
    delimiter,
  }) as Record<string, string>[];
}

/**
 * Parse XML and return the records found at recordPath (e.g. "orders.order")
 */
export async function parseXmlRecords(
  input: string,
  recordPath: string
): Promise<Record<string, unknown>[]> {
  const doc = await parseStringPromise(input, {
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
  });
  const found = getPath(doc, recordPath);
  if (found === undefined || found === null) return [];
  return (Array.isArray(found) ? found : [found]) as Record<string, unknown>[];
}

export function normalizeRecord(
  record: Record<string, unknown>,
  options: NormalizeOptions = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (options.mapping) {
    for (const [field, source] of Object.entries(options.mapping)) {
      out[field] = getPath(record, source);
    }
  } else {
    Object.assign(out, record);
  }

  for (const field of options.numeric ?? []) {
    if (out[field] !== undefined && out[field] !== '') {
      const n = Number(String(out[field]).replace(/[^0-9.\-]/g, ''));
      out[field] = Number.isFinite(n) ? n : null;
    }
  }
  for (const field of options.dates ?? []) {
    if (out[field]) {
      const d = new Date(String(out[field]));
      out[field] = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  return out;
}

export async function normalizeLegacyData(
  input: string,
  format: 'csv' | 'xml' | 'json',
  options: NormalizeOptions & { recordPath?: string; delimiter?: string } = {}
): Promise<Record<string, unknown>[]> {
  let records: Record<string, unknown>[];
  if (format === 'csv') {
    records = parseCsvRecords(input, options.delimiter);
  } else if (format === 'xml') {
    records = await parseXmlRecords(input, options.recordPath || '');
  } else {
    const parsed = JSON.parse(input);
    const found = options.recordPath ? getPath(parsed, options.recordPath) : parsed;
    records = (Array.isArray(found) ? found : [found]) as Record<string, unknown>[];
  }
  return records.map((r) => normalizeRecord(r, options));
}
