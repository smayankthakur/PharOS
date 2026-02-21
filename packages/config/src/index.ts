import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://pharos.local:3000,http://*.pharos.local:3000'),
  SYSTEM_OWNER_KEY: z.string().default('dev_system_owner_key'),
  SYSTEM_ADMIN_EMAILS: z.string().default('owner@shakti.test'),
});

export type AppConfig = {
  databaseUrl: string;
  redisUrl: string | null;
  jwtSecret: string;
  port: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  allowedOrigins: string[];
  systemOwnerKey: string;
  systemAdminEmails: string[];
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.parse(env);

  return {
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL?.trim() ? parsed.REDIS_URL : null,
    jwtSecret: parsed.JWT_SECRET,
    port: parsed.PORT,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    systemOwnerKey: parsed.SYSTEM_OWNER_KEY,
    systemAdminEmails: parsed.SYSTEM_ADMIN_EMAILS.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  };
};
