import { Injectable, OnModuleDestroy } from '@nestjs/common';
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
  private readonly queue: Queue;

  constructor() {
    const config = loadConfig();
    this.queue = new Queue('pharos-queue', {
      connection: { url: config.redisUrl },
    });
  }

  async enqueueCapture(job: CompetitorCaptureJob): Promise<string> {
    const queued = await this.queue.add('competitor.capture', job);
    return queued.id ?? '';
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.close();
    } catch {
      // no-op during shutdown
    }
  }
}
