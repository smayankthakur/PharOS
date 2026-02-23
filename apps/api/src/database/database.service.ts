import { Injectable, OnModuleDestroy, OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow, type PoolClient } from 'pg';
import { loadConfig } from '@pharos/config';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly pool: Pool;
  private isHealthy: boolean;
  private isClosed: boolean;

  constructor() {
    const config = loadConfig();
    const parsedDatabaseUrl = new URL(config.databaseUrl);
    const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, '');
    const sslEnabled = parsedDatabaseUrl.searchParams.get('sslmode') === 'require';

    console.info(
      `[db] connection target host=${parsedDatabaseUrl.hostname} db=${databaseName} ssl=${sslEnabled ? 'on' : 'off'}`,
    );

    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.isHealthy = false;
    this.isClosed = false;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.isHealthy = true;
    } catch (error) {
      this.isHealthy = false;
      console.error(
        'Database connection failed. Check DATABASE_URL and Railway env vars.',
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closePool();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.closePool();
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      this.isHealthy = true;
      return true;
    } catch {
      this.isHealthy = false;
      return false;
    }
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  get status(): 'connected' | 'disconnected' {
    return this.isHealthy ? 'connected' : 'disconnected';
  }

  private async closePool(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    await this.pool.end();
    this.isHealthy = false;
    this.isClosed = true;
  }
}
