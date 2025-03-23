import { NestFactory } from "@nestjs/core";
import { Workflow } from "./domain/feature/workflow/workflow.feature";
import { ConnectionType } from "./domain/feature/workflow/workflow.state.model";
import { Duration } from "luxon";
import { setTimeout } from "node:timers/promises";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();

  const workflow = app.get(Workflow);

  const everyFiveSeconds = Duration.fromObject({ seconds: 5 });

  while (true) {
    await workflow.handler(ConnectionType.PRIMARY, ConnectionType.BACKUP);
    await setTimeout(everyFiveSeconds.as("milliseconds"));
  }
}
bootstrap();
