import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./app.config";
import { ConnectionManagerService } from "./connection-manager.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: unknown) => appConfig.parse(config),
    }),
    LoggerModule.forRoot(),
  ],
  providers: [ConnectionManagerService],
})
export class AppModule {}
