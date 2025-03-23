import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./app.config";
import { levelStrings, Logger } from "./domain/logger.port";
import { NestPinoLogger } from "./system/logger/nest-pino.logger";
import { ConnectionManager } from "./domain/feature/connection/connection-manager.port";
import { NmcliConnectionManager } from "./infrastructure/connection/nmcli-connection-manager.impl";
import { Workflow } from "./domain/feature/workflow/workflow.feature";
import { pinoParams } from "./infrastructure/logger/pino.params";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: unknown) => appConfig.parse(config),
    }),
    LoggerModule.forRoot(pinoParams),
  ],
  providers: [
    { provide: Logger, useClass: NestPinoLogger },
    {
      provide: ConnectionManager,
      useFactory: (logger: Logger) => new NmcliConnectionManager(logger),
      inject: [Logger],
    },
    {
      provide: Workflow,
      useFactory: (connectionManager: ConnectionManager, logger: Logger) =>
        new Workflow(connectionManager, logger),
      inject: [ConnectionManager, Logger],
    },
  ],
})
export class AppModule {}
