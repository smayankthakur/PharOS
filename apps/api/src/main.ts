import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';
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
  const isProduction = config.nodeEnv === 'production';

  app.enableShutdownHooks();

  const allowedOrigins = config.allowedOrigins;
  const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
    const requestOrigin = req.header('origin');

    if (!requestOrigin) {
      const isHealthRoute = req.path === '/health';
      if (!isProduction || isHealthRoute) {
        callback(null, { credentials: true, origin: true });
        return;
      }

      callback(new Error('CORS origin required in production'), {
        origin: false,
      });
      return;
    }

    const allowed = allowedOrigins.some((pattern) => matchesWildcardOrigin(requestOrigin, pattern));
    if (!allowed) {
      callback(new Error('CORS origin denied'), {
        origin: false,
      });
      return;
    }

    callback(null, { credentials: true, origin: true });
  };

  app.enableCors(corsDelegate);

  const logger = app.get(AppLoggerService);
  logger.info('api.bootstrap', { allowedOrigins });

  await app.listen(config.port);
  logger.info('api.started', { port: config.port });
};

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap API', error);
  process.exit(1);
});
