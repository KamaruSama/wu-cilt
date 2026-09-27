import { randomUUID } from 'node:crypto';

type LogLevel = 'info' | 'warn' | 'error';
type LogFields = Record<string, string | number | boolean | null | undefined>;

function sanitizeMessage(message: string): string {
  return message
    .replace(/((?:password|passwd|pwd|token|csrf|cookie|authorization|secret)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[URL]')
    .slice(0, 500);
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'wu-s',
    event,
    ...fields,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.info(output);
}

export function createRequestId(input?: string | null): string {
  return input && /^[A-Za-z0-9._-]{1,64}$/.test(input) ? input : randomUUID();
}

export function logInfo(event: string, fields?: LogFields): void {
  write('info', event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  write('warn', event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}): string {
  const errorId = randomUUID();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? sanitizeMessage(error.stack) : undefined;
  write('error', event, {
    ...fields,
    errorId,
    errorType: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: sanitizeMessage(message),
    errorStack: stack,
  });
  return errorId;
}

export function safePath(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  try {
    return new URL(value, 'https://ciltapp.wu.ac.th').pathname.slice(0, 200);
  } catch {
    return 'invalid';
  }
}
