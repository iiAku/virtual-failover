import { NestFactory } from "@nestjs/core";
import { Workflow } from "./domain/feature/workflow/workflow.feature";
import { ConnectionType } from "./domain/feature/workflow/workflow.state.model";
import { Duration } from "luxon";
import { setTimeout } from "node:timers/promises";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "./app.config";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();

  const workflow = app.get(Workflow);
  const config = app.get(ConfigService);

  const appConfig = config.get<AppConfig>("_PROCESS_ENV_VALIDATED");

  const everyFiveSeconds = Duration.fromObject({
    seconds: appConfig.PRIMARY_CHECK_INTERVAL_IN_SECONDS,
  });

  while (true) {
    await workflow.handler(
      ConnectionType.PRIMARY,
      ConnectionType.BACKUP,
      appConfig.FALLBACK_CONNECTION ? ConnectionType.FALLBACK : undefined,
    );
    await setTimeout(everyFiveSeconds.as("milliseconds"));
  }
}
bootstrap();
