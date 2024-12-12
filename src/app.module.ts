import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./app.config";
import { ConnectionManagerService } from "./connection-manager.service";


const levelStrings = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
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
