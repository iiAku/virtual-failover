import { z } from "zod";

export const MONITORING_URL = [
  "https://1.1.1.1",
  "https://baidu.com",
  "https://bing.com",
  "https://duckduckgo.com",
  "https://example.com",
  "https://facebook.com",
  "https://google.com",
  "https://instagram.com",
  "https://apple.com",
  "https://pinterest.com",
  "https://reddit.com",
  "https://t.me",
  "https://temu.com",
  "https://tiktok.com",
  "https://whatsapp.com",
  "https://wikipedia.org",
  "https://yahoo.com",
  "https://youtube.com",
  "https://zoom.us",
  "https://x.com",
  "https://aliexpress.com",
  "https://yandex.ru",
  "https://ebay.com",
  "https://live.com",
  "https://twitch.tv",
  "https://netflix.com",
  "https://linkedin.com",
];

export const appConfig = z.object({
  PRIMARY_CONNECTION: z.string(),
  BACKUP_CONNECTION: z.string(),
  FALLBACK_CONNECTION: z.string().optional(),
  PRIMARY_CHECK_INTERVAL_IN_SECONDS: z.coerce.number().default(5),
  BACKUP_CHECK_INTERVAL_IN_SECONDS: z.coerce.number().default(30),
});

export type AppConfig = z.infer<typeof appConfig>;
