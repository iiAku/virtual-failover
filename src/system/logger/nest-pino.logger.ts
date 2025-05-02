import { Logger } from "../../domain/logger.port";
import { PinoLogger } from "nestjs-pino";
import { Injectable } from "@nestjs/common";
import { LogLevel } from "../../domain/logger.port";

@Injectable()
export class NestPinoLogger implements Logger {
  constructor(private readonly logger: PinoLogger) {}

  [LogLevel.Error](message: string, context?: object): void {
    this.logger.error(
      context instanceof Error ? context : { context },
      message,
    );
  }

  [LogLevel.Info](message: string, context?: object): void {
    this.logger.info(context instanceof Error ? context : { context }, message);
  }

  [LogLevel.Warn](message: string, context?: object): void {
    this.logger.warn(context instanceof Error ? context : { context }, message);
  }

  [LogLevel.Debug](message: string, context?: object): void {
    this.logger.debug(
      context instanceof Error ? context : { context },
      message,
    );
  }

  [LogLevel.Fatal](message: string, context?: object): void {
    this.logger.fatal(
      context instanceof Error ? context : { context },
      message,
    );
  }

  [LogLevel.Trace](message: string, context: unknown | undefined): void {
    this.logger.trace(
      context instanceof Error ? context : { context },
      message,
    );
  }

  setContext(context: string): void {
    this.logger.setContext(context);
  }

  flush(): void {
    this.logger.logger.flush();
  }
}
