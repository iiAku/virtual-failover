import { z } from "zod";

export const appConfig = z.object({
  PRIMARY_CONNECTION: z.string().default("enp34s0"),
  FAILOVER_CONNECTION: z.string().default("enp39s0f3u1u3"),
  MONITORING_URL: z
    .preprocess((value) => String(value).split(","), z.array(z.string()))
    .default("http://1.1.1.1"),
  CHECK_INTERVAL_IN_SECONDS: z.coerce.number().default(10),
});

export type AppConfig = z.infer<typeof appConfig>;
