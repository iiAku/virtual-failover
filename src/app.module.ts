import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./app.config";
import { Logger } from "./domain/logger.port";
import { NestPinoLogger } from "./system/logger/nest-pino.logger";
import { ConnectionManager } from "./domain/feature/connection/connection-manager.port";
import { NmcliConnectionManager } from "./infrastructure/connection/nmcli-connection-manager.impl";
import { Workflow } from "./domain/feature/workflow/workflow.feature";
import { pinoParams } from "./infrastructure/logger/pino.params";
import { WorkflowState } from "./domain/feature/workflow/workflow.state.model";

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
      useFactory: (logger: Logger, config) => new NmcliConnectionManager(logger, config),
      inject: [Logger, ConfigService],
    },
    WorkflowState,
    {
      provide: Workflow,
      useFactory: (
        connectionManager: ConnectionManager,
        workflowState: WorkflowState,
        logger: Logger,
      ) => new Workflow(connectionManager, workflowState, logger),
      inject: [ConnectionManager, WorkflowState, Logger],
    },
  ],
})
export class AppModule {}
