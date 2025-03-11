import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./app.config";
import { ConnectionManagerService } from "./connection-manager.service";
import { Logger } from "./system/logger/logger.port";
import { NestPinoLogger } from "./system/logger/nest-pino.logger";

export enum LogLevel {
  Trace = "trace",
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
  Fatal = "fatal",
}

const levelStrings = {
  10: LogLevel.Trace,
  20: LogLevel.Debug,
  30: LogLevel.Info,
  40: LogLevel.Warn,
  50: LogLevel.Error,
  60: LogLevel.Fatal,
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: unknown) => appConfig.parse(config),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        formatters: {
          level(label, number) {
            return { level: levelStrings[number] || label };
          },
        },
      },
    }),
  ],
  providers: [
    { provide: Logger, useClass: NestPinoLogger },
    ConnectionManagerService,
  ],
})
export class AppModule {}
