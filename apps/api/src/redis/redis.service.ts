import { Injectable, OnModuleDestroy, OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { loadConfig } from '@pharos/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly client: Redis;
  private isHealthy: boolean;
  private isClosed: boolean;

  constructor() {
    const config = loadConfig();
    this.client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    this.isHealthy = false;
    this.isClosed = false;
  }

  async onModuleInit(): Promise<void> {
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
    try {
      const result = await this.client.ping();
      this.isHealthy = result === 'PONG';
      return this.isHealthy;
    } catch {
      this.isHealthy = false;
      return false;
    }
  }

  get status(): 'connected' | 'disconnected' {
    return this.isHealthy ? 'connected' : 'disconnected';
  }

  private async closeClient(): Promise<void> {
    if (this.isClosed) {
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
