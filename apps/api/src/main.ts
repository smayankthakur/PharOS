import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
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

  const allowedOrigins = config.allowedOrigins;

  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed = allowedOrigins.some((pattern) => matchesWildcardOrigin(origin, pattern));

      if (allowed) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin denied'));
    },
  });

  const logger = app.get(AppLoggerService);
  logger.info('api.bootstrap', { allowedOrigins });

  await app.listen(config.port);
  logger.info('api.started', { port: config.port });
};

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap API', error);
  process.exit(1);
});
