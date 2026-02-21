import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { loadConfig } from '@pharos/config';

export type CompetitorCaptureJob = {
  tenant_id: string;
  competitor_item_id: string;
  price: number;
  currency?: string;
  captured_at?: string;
  evidence_json?: Record<string, unknown>;
  raw_json?: Record<string, unknown>;
};

@Injectable()
export class CompetitorQueueService implements OnModuleDestroy {
  private readonly queue: Queue | null;

  constructor() {
    const config = loadConfig();
    this.queue = config.redisUrl
      ? new Queue('pharos-queue', {
          connection: { url: config.redisUrl },
        })
      : null;
  }

  async enqueueCapture(job: CompetitorCaptureJob): Promise<string> {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'Queue is unavailable in in-memory mode. Configure REDIS_URL to enable background jobs.',
      );
    }

    const queued = await this.queue.add('competitor.capture', job);
    return queued.id ?? '';
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.queue) {
      return;
    }

    try {
      await this.queue.close();
    } catch {
      // no-op during shutdown
    }
  }
}
