import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { loadConfig } from '@pharos/config';
import { AppLoggerService } from './logger/app-logger.service';

const matchesWildcardOrigin = (origin: string, pattern: string): boolean => {
  if (!pattern.includes('*')) {
    return origin === pattern;
  }

  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*');
  const regex = new RegExp(`^${escapedPattern}$`);
  return regex.test(origin);
};

const bootstrap = async (): Promise<void> => {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const envOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const defaults = [
    'https://pharos.sitelytc.com',
    'https://pharos-one.vercel.app',
    'https://pharos.vercel.app',
    'http://localhost:3000',
  ];

  const allowedOrigins: string[] = Array.from(
    new Set<string>([...defaults, ...config.allowedOrigins, ...envOrigins]),
  );

  const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
    const requestOrigin = req.header('origin');

    if (!requestOrigin) {
      callback(null, { origin: true });
      return;
    }

    const allowed = allowedOrigins.some((pattern: string) =>
      matchesWildcardOrigin(requestOrigin, pattern),
    );
    if (!allowed) {
      callback(null, { origin: false });
      return;
    }

    callback(null, {
      origin: requestOrigin,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-System-Owner-Key',
        'X-Tenant-Id',
      ],
      optionsSuccessStatus: 204,
    });
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    const current = res.getHeader('Vary');
    if (typeof current === 'string') {
      if (!current.includes('Origin')) {
        res.setHeader('Vary', `${current}, Origin`);
      }
    } else {
      res.setHeader('Vary', 'Origin');
    }
    next();
  });

  app.enableCors(corsDelegate);

  const logger = app.get(AppLoggerService);
  logger.info('api.bootstrap', { allowedOrigins });

  const port = Number(process.env.PORT ?? config.port ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.info('api.started', { port });
};

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap API', error);
  process.exit(1);
});
