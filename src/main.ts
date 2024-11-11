import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConnectionManagerService } from "./connection-manager.service";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();

  const connectionManager = app.get(ConnectionManagerService);

  await connectionManager.start();
}
bootstrap();
