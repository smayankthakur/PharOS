import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { loadConfig } from '@pharos/config';

const startWorker = async (): Promise<void> => {
  const config = loadConfig();

  const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const pool = new Pool({ connectionString: config.databaseUrl });
  const worker = new Worker(
    'pharos-queue',
    async (job) => {
      if (job.name !== 'competitor.capture') {
        return;
      }

      const payload = job.data as {
        tenant_id: string;
        competitor_item_id: string;
        price: number;
        currency?: string;
        captured_at?: string;
        evidence_json?: Record<string, unknown>;
        raw_json?: Record<string, unknown>;
      };

      const itemResult = await pool.query<{ id: string }>(
        `
        SELECT id
        FROM competitor_items
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1
        `,
        [payload.tenant_id, payload.competitor_item_id],
      );

      if (!itemResult.rows[0]) {
        throw new Error('competitor_item_id not found for tenant');
      }

      await pool.query(
        `
        INSERT INTO competitor_snapshots (
          tenant_id,
          competitor_item_id,
          price,
          currency,
          captured_at,
          method,
          evidence_json,
          raw_json
        )
        VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), 'worker', $6::jsonb, $7::jsonb)
        `,
        [
          payload.tenant_id,
          payload.competitor_item_id,
          payload.price,
          payload.currency ?? 'INR',
          payload.captured_at ?? null,
          JSON.stringify(payload.evidence_json ?? {}),
          JSON.stringify(payload.raw_json ?? {}),
        ],
      );
    },
    { connection },
  );

  let shuttingDown = false;

  console.log('Worker started');

  worker.on('failed', (job, error) => {
    console.error('Worker job failed', {
      jobId: job?.id,
      name: job?.name,
      message: error.message,
    });
  });

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await worker.close();
      await pool.end();
      await connection.quit();
    } catch {
      await pool.end().catch(() => undefined);
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
