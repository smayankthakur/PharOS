import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  PGHOST: z.string().optional(),
  PGPORT: z.string().optional(),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().optional(),
  PGSSLMODE: z.string().optional(),
  DATABASE_SSL: z.string().optional(),
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

const toBool = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const isLocalHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

export const normalizeDatabaseUrl = (raw: string | undefined): string => {
  if (!raw) {
    return '';
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const startsWithSingle = trimmed.startsWith("'");
  const endsWithSingle = trimmed.endsWith("'");
  const startsWithDouble = trimmed.startsWith('"');
  const endsWithDouble = trimmed.endsWith('"');

  if ((startsWithSingle && endsWithSingle) || (startsWithDouble && endsWithDouble)) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const buildDatabaseUrlFromPgEnv = (env: z.infer<typeof envSchema>, nodeEnv: string): string => {
  const host = env.PGHOST?.trim() ?? '';
  const user = env.PGUSER?.trim() ?? '';
  const password = env.PGPASSWORD?.trim() ?? '';
  const database = env.PGDATABASE?.trim() ?? '';
  const port = env.PGPORT?.trim() || '5432';

  if (!host || !user || !password || !database) {
    return '';
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);
  const url = new URL(
    `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}`,
  );

  const requireSsl =
    env.PGSSLMODE?.trim().toLowerCase() === 'require' ||
    toBool(env.DATABASE_SSL) ||
    (nodeEnv === 'production' && !isLocalHost(host));

  if (requireSsl) {
    url.searchParams.set('sslmode', 'require');
  }

  return url.toString();
};

const applySslModeIfNeeded = (databaseUrl: string, env: z.infer<typeof envSchema>): string => {
  const parsed = new URL(databaseUrl);
  const requireSsl =
    env.PGSSLMODE?.trim().toLowerCase() === 'require' ||
    toBool(env.DATABASE_SSL) ||
    (env.NODE_ENV === 'production' && !isLocalHost(parsed.hostname));

  if (requireSsl && !parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }

  return parsed.toString();
};

const invalidDatabaseUrlError = (
  normalizedExists: boolean,
  env: z.infer<typeof envSchema>,
): Error => {
  const diagnostics = {
    DATABASE_URL: normalizedExists,
    PGHOST: Boolean(env.PGHOST?.trim()),
    PGPORT: Boolean(env.PGPORT?.trim()),
    PGUSER: Boolean(env.PGUSER?.trim()),
    PGPASSWORD: Boolean(env.PGPASSWORD?.trim()),
    PGDATABASE: Boolean(env.PGDATABASE?.trim()),
  };

  return new Error(
    `Invalid DATABASE_URL. Set DATABASE_URL to a valid Postgres URL like postgresql://user:pass@host:5432/db?sslmode=require. Diagnostics: ${JSON.stringify(
      diagnostics,
    )}`,
  );
};

const resolveDatabaseUrl = (env: z.infer<typeof envSchema>): string => {
  const normalizedDatabaseUrl = normalizeDatabaseUrl(env.DATABASE_URL);
  const fromPgVars = buildDatabaseUrlFromPgEnv(env, env.NODE_ENV);
  const hasDatabaseUrl = normalizedDatabaseUrl.length > 0;
  const hasPgParts =
    Boolean(env.PGHOST?.trim()) &&
    Boolean(env.PGUSER?.trim()) &&
    Boolean(env.PGPASSWORD?.trim()) &&
    Boolean(env.PGDATABASE?.trim());
  const databaseUrl = hasDatabaseUrl ? normalizedDatabaseUrl : fromPgVars;

  if (databaseUrl.length === 0) {
    if (!hasDatabaseUrl && !hasPgParts) {
      throw new Error(
        'No database configuration found. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.',
      );
    }
    throw invalidDatabaseUrlError(hasDatabaseUrl, env);
  }

  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    throw invalidDatabaseUrlError(hasDatabaseUrl, env);
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw invalidDatabaseUrlError(hasDatabaseUrl, env);
  }

  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw invalidDatabaseUrlError(hasDatabaseUrl, env);
  }

  return applySslModeIfNeeded(databaseUrl, env);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.parse(env);
  const nodeEnv = parsed.NODE_ENV;
  const isProduction = nodeEnv === 'production';
  const strictMode = isProduction;
  const parsedAllowedOrigins = parsed.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const defaultAllowedOrigins = isProduction
    ? ['https://pharos.sitelytc.com', 'https://pharos-one.vercel.app', 'https://pharos.vercel.app']
    : ['http://pharos.local:3000', 'http://*.pharos.local:3000', 'http://localhost:3000'];
  const allowedOrigins =
    parsedAllowedOrigins.length > 0
      ? Array.from(new Set(parsedAllowedOrigins))
      : defaultAllowedOrigins;
  const systemAdminEmails = parsed.SYSTEM_ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  const databaseUrl = resolveDatabaseUrl(parsed);

  if (env.CONFIG_DIAGNOSTICS === 'true') {
    const diagnostics: Record<string, boolean> = {
      DATABASE_URL: normalizeDatabaseUrl(parsed.DATABASE_URL).length > 0,
      PGHOST: Boolean(parsed.PGHOST?.trim()),
      PGPORT: Boolean(parsed.PGPORT?.trim()),
      PGUSER: Boolean(parsed.PGUSER?.trim()),
      PGPASSWORD: Boolean(parsed.PGPASSWORD?.trim()),
      PGDATABASE: Boolean(parsed.PGDATABASE?.trim()),
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

  if (strictMode && allowedOrigins.includes('*')) {
    throw new Error(
      `Invalid env var ALLOWED_ORIGINS: wildcard '*' is not allowed in production. strictMode=${strictMode} (NODE_ENV=${nodeEnv}).`,
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
    databaseUrl,
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
