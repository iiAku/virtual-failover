export enum LogLevel {
  Trace = "trace",
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
  Fatal = "fatal",
}

export const levelStrings = {
  10: LogLevel.Trace,
  20: LogLevel.Debug,
  30: LogLevel.Info,
  40: LogLevel.Warn,
  50: LogLevel.Error,
  60: LogLevel.Fatal,
};

export abstract class Logger {
  abstract [LogLevel.Info](message: string, context?: unknown): void;

  abstract [LogLevel.Error](message: string, context?: unknown): void;

  abstract [LogLevel.Warn](message: string, context?: unknown): void;

  abstract [LogLevel.Debug](message: string, context?: unknown): void;

  abstract [LogLevel.Trace](message: string, context?: unknown): void;

  abstract [LogLevel.Fatal](message: string, context?: unknown): void;

  abstract setContext(context: string): void;

  abstract flush(): void;
}
