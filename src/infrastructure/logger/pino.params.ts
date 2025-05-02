import { Params } from "nestjs-pino";
import { levelStrings } from "../../domain/logger.port";

export const pinoParams: Params = {
  pinoHttp: {
    formatters: {
      level(label, number) {
        return { level: levelStrings[number] || label };
      },
    },
  },
};
