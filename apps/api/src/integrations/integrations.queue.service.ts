import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { loadConfig } from '@pharos/config';

export type WebhookProcessJob = {
  tenant_id: string;
  provider: 'shopify' | 'woocommerce' | 'generic_rest';
};

export type ProviderSyncJob = {
  tenant_id: string;
  provider: 'shopify' | 'woocommerce' | 'generic_rest';
  resource: 'orders' | 'inventory' | 'products' | 'competitor';
  mode: 'full' | 'incremental';
};

@Injectable()
export class IntegrationsQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor() {
    const config = loadConfig();
    this.queue = new Queue('pharos-queue', {
      connection: { url: config.redisUrl },
    });
  }

  async enqueueWebhookProcess(job: WebhookProcessJob): Promise<string> {
    const queued = await this.queue.add('webhook.process', job);
    return queued.id ?? '';
  }

  async enqueueProviderSync(job: ProviderSyncJob): Promise<string> {
    const queued = await this.queue.add('provider.sync', job);
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
