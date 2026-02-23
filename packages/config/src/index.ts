import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(1),
  JWT_ISSUER: z.string().trim().optional(),
  JWT_AUDIENCE: z.string().trim().optional(),
  PORT: z.coerce.number().int().positive().default(4000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_BACKEND: z.enum(['memory', 'redis']).default('memory'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SYSTEM_MAX: z.coerce.number().int().positive().default(30),
  ALLOWED_ORIGINS: z.string().default('http://pharos.local:3000,http://*.pharos.local:3000'),
  SYSTEM_OWNER_KEY: z.string().default('dev_local_system_owner_key_at_least_32_chars'),
  SYSTEM_ADMIN_EMAILS: z.string().default('owner@shakti.test'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  redisUrl: string | null;
  jwtSecret: string;
  jwtIssuer: string | null;
  jwtAudience: string | null;
  port: number;
  rateLimitWindowMs: number;
  rateLimitBackend: 'memory' | 'redis';
  rateLimitMax: number;
  rateLimitLoginMax: number;
  rateLimitSystemMax: number;
  allowedOrigins: string[];
  systemOwnerKey: string;
  systemAdminEmails: string[];
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.parse(env);
  const nodeEnv = parsed.NODE_ENV;
  const isProduction = nodeEnv === 'production';
  const strictMode = isProduction;
  const allowedOrigins = parsed.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const systemAdminEmails = parsed.SYSTEM_ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  if (env.CONFIG_DIAGNOSTICS === 'true') {
    const diagnostics: Record<string, boolean> = {
      DATABASE_URL: parsed.DATABASE_URL.trim().length > 0,
      JWT_SECRET: parsed.JWT_SECRET.trim().length > 0,
      SYSTEM_OWNER_KEY: parsed.SYSTEM_OWNER_KEY.trim().length > 0,
      ALLOWED_ORIGINS: allowedOrigins.length > 0,
      SYSTEM_ADMIN_EMAILS: systemAdminEmails.length > 0,
      REDIS_URL: (parsed.REDIS_URL?.trim().length ?? 0) > 0,
    };
    console.info('[config] diagnostics', {
      nodeEnv,
      strictMode,
      requiredEnvPresence: diagnostics,
    });
  }

  if (parsed.JWT_SECRET.length < 32 || parsed.JWT_SECRET === 'change_me') {
    throw new Error(
      `Invalid env var JWT_SECRET: minimum length is 32 characters. strictMode=${strictMode} (NODE_ENV=${nodeEnv}).`,
    );
  }

  if (parsed.SYSTEM_OWNER_KEY.length < 32 && strictMode) {
    throw new Error(
      `Invalid env var SYSTEM_OWNER_KEY: minimum length is 32 characters. strictMode=${strictMode} (NODE_ENV=${nodeEnv}).`,
    );
  }

  if (isProduction && parsed.SYSTEM_OWNER_KEY === 'dev_system_owner_key') {
    throw new Error('SYSTEM_OWNER_KEY cannot use the development default in production.');
  }

  if (strictMode && allowedOrigins.length === 0) {
    throw new Error(
      `Invalid env var ALLOWED_ORIGINS: value cannot be empty in production. strictMode=${strictMode} (NODE_ENV=${nodeEnv}).`,
    );
  }

  if (isProduction && systemAdminEmails.length === 0) {
    throw new Error('SYSTEM_ADMIN_EMAILS must be configured in production.');
  }

  if (parsed.RATE_LIMIT_BACKEND === 'redis' && !parsed.REDIS_URL?.trim()) {
    throw new Error('REDIS_URL is required when RATE_LIMIT_BACKEND=redis.');
  }

  if (isProduction && parsed.RATE_LIMIT_BACKEND !== 'redis') {
    throw new Error(
      'RATE_LIMIT_BACKEND must be set to "redis" in production for multi-instance safety.',
    );
  }

  return {
    nodeEnv,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL?.trim() ? parsed.REDIS_URL : null,
    jwtSecret: parsed.JWT_SECRET,
    jwtIssuer: parsed.JWT_ISSUER?.trim() ? parsed.JWT_ISSUER : null,
    jwtAudience: parsed.JWT_AUDIENCE?.trim() ? parsed.JWT_AUDIENCE : null,
    port: parsed.PORT,
    rateLimitWindowMs:
      typeof parsed.RATE_LIMIT_WINDOW_SEC === 'number'
        ? parsed.RATE_LIMIT_WINDOW_SEC * 1000
        : parsed.RATE_LIMIT_WINDOW_MS,
    rateLimitBackend: parsed.RATE_LIMIT_BACKEND,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitLoginMax: parsed.RATE_LIMIT_LOGIN_MAX,
    rateLimitSystemMax: parsed.RATE_LIMIT_SYSTEM_MAX,
    allowedOrigins,
    systemOwnerKey: parsed.SYSTEM_OWNER_KEY,
    systemAdminEmails,
  };
};
