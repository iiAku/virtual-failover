export enum LogLevel {
  Info = "info",
  Error = "error",
  Warn = "warn",
  Debug = "debug",
  Trace = "trace",
  Fatal = "fatal",
}

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
