export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] ${level.toUpperCase()} ${msg}`;
  if (data) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export function debug(msg: string, data?: Record<string, unknown>): void {
  if (shouldLog("debug")) console.debug(formatMessage("debug", msg, data));
}

export function info(msg: string, data?: Record<string, unknown>): void {
  if (shouldLog("info")) console.info(formatMessage("info", msg, data));
}

export function warn(msg: string, data?: Record<string, unknown>): void {
  if (shouldLog("warn")) console.warn(formatMessage("warn", msg, data));
}

export function error(msg: string, data?: Record<string, unknown>): void {
  if (shouldLog("error")) console.error(formatMessage("error", msg, data));
}
