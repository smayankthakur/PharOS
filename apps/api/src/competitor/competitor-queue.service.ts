import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
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
  private readonly connection: Redis;
  private readonly queue: Queue<CompetitorCaptureJob>;

  constructor() {
    const config = loadConfig();
    this.connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<CompetitorCaptureJob>('pharos-queue', { connection: this.connection });
  }

  async enqueueCapture(job: CompetitorCaptureJob): Promise<string> {
    const queued = await this.queue.add('competitor.capture', job);
    return queued.id ?? '';
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.close();
      await this.connection.quit();
    } catch {
      this.connection.disconnect();
    }
  }
}
