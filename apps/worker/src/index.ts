import 'dotenv/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadConfig } from '@pharos/config';

const startWorker = async (): Promise<void> => {
  const config = loadConfig();

  const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue('pharos-queue', { connection });
  let shuttingDown = false;

  console.log('Worker started');

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await queue.close();
      await connection.quit();
    } catch {
      connection.disconnect();
    }

    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });

  process.once('beforeExit', () => {
    void shutdown();
  });
};

startWorker().catch((error: unknown) => {
  console.error('Worker failed to start', error);
  process.exit(1);
});
