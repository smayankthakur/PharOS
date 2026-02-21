import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
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
  private readonly queue: Queue | null;

  constructor() {
    const config = loadConfig();
    this.queue = config.redisUrl
      ? new Queue('pharos-queue', {
          connection: { url: config.redisUrl },
        })
      : null;
  }

  async enqueueWebhookProcess(job: WebhookProcessJob): Promise<string> {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'Queue is unavailable in in-memory mode. Configure REDIS_URL to enable webhook processing.',
      );
    }

    const queued = await this.queue.add('webhook.process', job);
    return queued.id ?? '';
  }

  async enqueueProviderSync(job: ProviderSyncJob): Promise<string> {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'Queue is unavailable in in-memory mode. Configure REDIS_URL to enable provider sync.',
      );
    }

    const queued = await this.queue.add('provider.sync', job);
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
