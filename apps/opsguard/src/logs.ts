import { open, stat } from 'fs/promises';
import { AppError } from '@athena/shared';
import { getLogSources } from './config/services';

const MAX_READ_BYTES = 2 * 1024 * 1024;

export interface LogQuery {
  source: string;
  contains?: string;
  level?: 'error' | 'warn' | 'info' | 'debug';
  limit: number;
}

const LEVEL_PATTERNS: Record<string, RegExp> = {
  error: /\b(error|err|fatal|exception|panic|critical)\b/i,
  warn: /\b(warn|warning)\b/i,
  info: /\binfo\b/i,
  debug: /\bdebug\b/i,
};

/**
 * Read the tail of a configured log file and filter lines.
 * Only sources from OPSGUARD_LOG_FILES can be read.
 */
export async function queryLogFile(query: LogQuery): Promise<{
  source: string;
  scannedBytes: number;
  matched: number;
  lines: string[];
}> {
  const sources = getLogSources();
  const path = sources[query.source];
  if (!path) {
    const known = Object.keys(sources);
    // Tell the model plainly when guessing another name cannot help, so it moves on instead of retrying.
    if (known.length === 0) {
      throw new AppError(
        'Log search is not set up on this Athena instance (OPSGUARD_LOG_FILES is empty). Do not call query_logs again in this run; continue the investigation without logs and mention this gap in your report.',
        { statusCode: 404 }
      );
    }
    throw new AppError(
      `Unknown log source "${query.source}". Use one of these exact names: ${known.join(', ')}`,
      { statusCode: 404 }
    );
  }

  const info = await stat(path);
  const start = Math.max(0, info.size - MAX_READ_BYTES);
  const length = info.size - start;
  const handle = await open(path, 'r');
  let text: string;
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    text = buffer.toString('utf8');
  } finally {
    await handle.close();
  }

  let lines = text.split(/\r?\n/).filter(Boolean);
  if (start > 0) lines = lines.slice(1); // first line is likely partial

  const needle = query.contains?.toLowerCase();
  const levelPattern = query.level ? LEVEL_PATTERNS[query.level] : undefined;
  const matched = lines.filter(
    (line) => (!needle || line.toLowerCase().includes(needle)) && (!levelPattern || levelPattern.test(line))
  );

  return {
    source: query.source,
    scannedBytes: length,
    matched: matched.length,
    lines: matched.slice(-query.limit).map((l) => (l.length > 1000 ? `${l.slice(0, 1000)}…` : l)),
  };
}
