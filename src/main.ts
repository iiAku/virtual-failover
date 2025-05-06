import { NestFactory } from "@nestjs/core";
import { Workflow } from "./domain/feature/workflow/workflow.feature";
import {
  ConnectionType,
  WorkflowState,
} from "./domain/feature/workflow/workflow.state.model";
import { Duration } from "luxon";
import { setTimeout } from "node:timers/promises";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "./app.config";
import { ConnectionState } from "./domain/feature/connection/connection.type";
import { Logger } from "./domain/logger.port";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();

  const workflow = app.get(Workflow);
  const state = app.get(WorkflowState);
  const logger = app.get(Logger);
  const config = app.get(ConfigService);

  const appConfig = config.get<AppConfig>("_PROCESS_ENV_VALIDATED");

  const primaryDelay = Duration.fromObject({
    seconds: appConfig.PRIMARY_CHECK_INTERVAL_IN_SECONDS,
  }).as("milliseconds");

  const backupDelay = Duration.fromObject({
    seconds: appConfig.BACKUP_CHECK_INTERVAL_IN_SECONDS,
  }).as("milliseconds");

  while (true) {
    await workflow.handler(
      ConnectionType.PRIMARY,
      ConnectionType.BACKUP,
      appConfig.FALLBACK_CONNECTION ? ConnectionType.FALLBACK : undefined,
    );
    const delay = [ConnectionState.BACKUP, ConnectionState.FALLBACK].includes(
      state.getCurrentConnectionState(),
    )
      ? backupDelay
      : primaryDelay;
    logger.info("Current check delay", delay);
    await setTimeout(delay);
  }
}
bootstrap();
