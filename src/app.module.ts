import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./app.config";
import { ConnectionManagerService } from "./connection-manager.service";


const levelStrings = {
  10: 'debug',
  20: 'info',
  30: 'warn',
  40: 'error',
  50: 'fatal'
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: unknown) => appConfig.parse(config),
    }),
    LoggerModule.forRoot({
      pinoHttp:{
        formatters:{
            level(label, number) {
                return { level: levelStrings[number] || label };
            }
        }
      }
    }),
  ],
  providers: [ConnectionManagerService],
})
export class AppModule {}
