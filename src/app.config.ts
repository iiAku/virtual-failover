import { z } from "zod";

export const appConfig = z.object({
  PRIMARY_CONNECTION: z.string().default("enp34s0"),
  FAILOVER_CONNECTION: z.string().default("enp39s0f3u1c4i2"),
  MONITORING_URL: z
    .string()
    .default("http://1.1.1.1,http://1.1.1.1,http://8.8.4,4,http://8.8.8.8")
    .transform((value) => value.split(",")),
  CHECK_INTERVAL_IN_SECONDS: z.coerce.number().default(3),
});

export type AppConfig = z.infer<typeof appConfig>;

http://1.1.1.1
http://8.8.8.8
http://8.8.4.4
http://9.9.9.9
http://208.67.222.222
http://208.67.220.220

