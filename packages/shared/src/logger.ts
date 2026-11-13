type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: any;
}

class Logger {
  private level: LogLevel;
  private enableTimestamp: boolean;

  constructor(level: LogLevel = 'info', enableTimestamp = true) {
    this.level = level;
    this.enableTimestamp = enableTimestamp;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, meta?: LogMeta): string {
    const parts: string[] = [];

    if (this.enableTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);

    if (meta && Object.keys(meta).length > 0) {
      parts.push(JSON.stringify(this.sanitizeMeta(meta)));
    }

    return parts.join(' ');
  }

  private sanitizeMeta(meta: LogMeta): LogMeta {
    const sanitized: LogMeta = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];

    for (const [key, value] of Object.entries(meta)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeMeta(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  debug(message: string, meta?: LogMeta): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: LogMeta): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: LogMeta): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, error?: Error | LogMeta, meta?: LogMeta): void {
    if (this.shouldLog('error')) {
      let errorMeta: LogMeta = {};

      if (error instanceof Error) {
        errorMeta = {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...((error as any).context || {}),
          },
          ...meta,
        };
      } else {
        errorMeta = error || {};
      }

      console.error(this.formatMessage('error', message, errorMeta));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Export singleton instance
export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info',
  process.env.NODE_ENV !== 'production'
);

export { Logger, LogLevel };
