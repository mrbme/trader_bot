import { config } from '@/utils/config.ts';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const RESET = '\x1b[0m';

const shouldLog = (level: LogLevel): boolean => LEVEL_ORDER[level] >= LEVEL_ORDER[config.logLevel];

const formatTimestamp = (): string => new Date().toISOString();

const formatMessage = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): string => {
  const color = LEVEL_COLORS[level];
  const tag = level.toUpperCase().padEnd(5);
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${color}[${formatTimestamp()}] ${tag}${RESET} ${message}${metaStr}`;
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('debug')) console.log(formatMessage('debug', message, meta));
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('info')) console.log(formatMessage('info', message, meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },
};

export default logger;
