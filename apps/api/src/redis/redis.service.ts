import { Injectable, OnModuleDestroy, OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { loadConfig } from '@pharos/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly client: Redis | null;
  private readonly fallbackMode: boolean;
  private isHealthy: boolean;
  private isClosed: boolean;

  constructor() {
    const config = loadConfig();
    this.fallbackMode = !config.redisUrl;
    this.client = config.redisUrl
      ? new Redis(config.redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        })
      : null;
    this.isHealthy = this.fallbackMode;
    this.isClosed = false;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.connect();
    await this.client.ping();
    this.isHealthy = true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeClient();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.closeClient();
  }

  async checkConnection(): Promise<boolean> {
    if (!this.client) {
      this.isHealthy = true;
      return true;
    }

    try {
      const result = await this.client.ping();
      this.isHealthy = result === 'PONG';
      return this.isHealthy;
    } catch {
      this.isHealthy = false;
      return false;
    }
  }

  get status(): 'connected' | 'disconnected' | 'in_memory' {
    if (this.fallbackMode) {
      return 'in_memory';
    }

    return this.isHealthy ? 'connected' : 'disconnected';
  }

  private async closeClient(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    if (!this.client) {
      this.isClosed = true;
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }

    this.isHealthy = false;
    this.isClosed = true;
  }
}
