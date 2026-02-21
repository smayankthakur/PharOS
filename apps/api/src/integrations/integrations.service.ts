import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { IntegrationsQueueService } from './integrations.queue.service';

const providerSchema = z.enum(['shopify', 'woocommerce', 'generic_rest']);
const resourceSchema = z.enum(['orders', 'inventory', 'products', 'competitor']);
const syncModeSchema = z.enum(['full', 'incremental']);

const configSchema = z.object({
  config_json: z.record(z.string(), z.unknown()),
});

const syncRequestSchema = z.object({
  resource: resourceSchema,
  mode: syncModeSchema.optional(),
});

type Provider = z.infer<typeof providerSchema>;

type IntegrationAccountRow = {
  id: string;
  tenant_id: string;
  provider: Provider;
  status: string;
  config_json: Record<string, unknown>;
};

type WebhookEventRow = {
  id: string;
  provider: Provider;
  event_type: string;
  external_id: string;
};

type SyncRunRow = {
  id: string;
  provider: Provider;
  resource: string;
  status: 'running' | 'success' | 'partial' | 'failed';
  started_at: Date;
  completed_at: Date | null;
  stats_json: Record<string, unknown>;
  error_text: string | null;
};

type SyncStateRow = {
  provider: string;
  resource: string;
  cursor_type: string;
  cursor_value: string;
  updated_at: Date;
};

export type SaveIntegrationConfigInput = z.input<typeof configSchema>;
export type ConnectorSyncInput = z.input<typeof syncRequestSchema>;

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(IntegrationsQueueService)
    private readonly queueService: IntegrationsQueueService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  parseProvider(value: string): Provider {
    const parsed = providerSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException('provider must be shopify|woocommerce|generic_rest');
    }
    return parsed.data;
  }

  async saveConfig(
    tenantId: string,
    actorUserId: string,
    provider: Provider,
    input: SaveIntegrationConfigInput,
  ): Promise<{ id: string; provider: Provider; status: string; config_json: Record<string, unknown> }> {
    const parsed = configSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.databaseService.query<IntegrationAccountRow>(
      `
      INSERT INTO integration_accounts (
        tenant_id,
        provider,
        status,
        config_json,
        updated_at
      )
      VALUES ($1,$2,'active',$3::jsonb,now())
      ON CONFLICT (tenant_id, provider)
      DO UPDATE SET
        status = 'active',
        config_json = EXCLUDED.config_json,
        updated_at = now()
      RETURNING id, tenant_id, provider, status, config_json
      `,
      [tenantId, provider, JSON.stringify(parsed.data.config_json)],
    );
    const row = result.rows[0];
    if (!row) {
      throw new BadRequestException('Failed to save integration config');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'connector.tested',
      entityType: 'integration_account',
      entityId: row.id,
      payload: { provider, operation: 'config_saved' },
    });

    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      config_json: row.config_json,
    };
  }

  async testConnector(
    tenantId: string,
    actorUserId: string,
    provider: Provider,
  ): Promise<{ ok: boolean; provider: Provider; sample: Record<string, unknown> }> {
    const account = await this.getIntegrationAccount(tenantId, provider);
    if (!account) {
      throw new BadRequestException('Connector config not found');
    }

    let sample: Record<string, unknown> = {};
    if (provider === 'shopify') {
      const shopDomain = this.readString(account.config_json, 'shop_domain');
      const accessToken = this.readString(account.config_json, 'access_token');
      if (!shopDomain || !accessToken) {
        throw new BadRequestException('shop_domain/access_token required');
      }

      const response = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken, Accept: 'application/json' },
      });
      sample = {
        status: response.status,
        ok: response.ok,
      };
    } else if (provider === 'woocommerce') {
      const baseUrl = this.readString(account.config_json, 'base_url');
      const key = this.readString(account.config_json, 'consumer_key');
      const secret = this.readString(account.config_json, 'consumer_secret');
      if (!baseUrl || !key || !secret) {
        throw new BadRequestException('base_url/consumer_key/consumer_secret required');
      }

      const url = new URL('/wp-json/wc/v3/orders', baseUrl);
      url.searchParams.set('consumer_key', key);
      url.searchParams.set('consumer_secret', secret);
      url.searchParams.set('per_page', '1');
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      sample = { status: response.status, ok: response.ok };
    } else {
      const endpoints = this.readRecord(account.config_json, 'endpoints');
      const orders = endpoints ? this.readRecord(endpoints, 'orders') : null;
      const url = orders ? this.readString(orders, 'url') : null;
      if (!url) {
        throw new BadRequestException('generic_rest endpoints.orders.url required');
      }
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      sample = { status: response.status, ok: response.ok };
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'connector.tested',
      entityType: 'integration_account',
      entityId: account.id,
      payload: { provider, sample },
    });

    return { ok: true, provider, sample };
  }

  async enqueueSync(
    tenantId: string,
    actorUserId: string,
    provider: Provider,
    body: ConnectorSyncInput,
  ): Promise<{ enqueued: true; job_id: string }> {
    const parsed = syncRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const jobId = await this.queueService.enqueueProviderSync({
      tenant_id: tenantId,
      provider,
      resource: parsed.data.resource,
      mode: parsed.data.mode ?? 'incremental',
    });

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'sync.started',
      entityType: 'sync_job',
      entityId: jobId,
      payload: {
        provider,
        resource: parsed.data.resource,
        mode: parsed.data.mode ?? 'incremental',
      },
    });

    return { enqueued: true, job_id: jobId };
  }

  async listSyncRuns(
    tenantId: string,
    filters: { provider?: string; resource?: string; status?: string },
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const params: unknown[] = [tenantId];
    const clauses: string[] = ['tenant_id = $1'];

    if (filters.provider) {
      params.push(filters.provider);
      clauses.push(`provider = $${params.length}`);
    }
    if (filters.resource) {
      params.push(filters.resource);
      clauses.push(`resource = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }

    const result = await this.databaseService.query<SyncRunRow>(
      `
      SELECT id, provider, resource, status, started_at, completed_at, stats_json, error_text
      FROM sync_runs
      WHERE ${clauses.join(' AND ')}
      ORDER BY started_at DESC
      LIMIT 100
      `,
      params,
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        resource: row.resource,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at,
        stats_json: row.stats_json,
        error_text: row.error_text,
      })),
    };
  }

  async listSyncState(
    tenantId: string,
    provider?: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const params: unknown[] = [tenantId];
    let extra = '';
    if (provider) {
      params.push(provider);
      extra = ' AND provider = $2';
    }

    const result = await this.databaseService.query<SyncStateRow>(
      `
      SELECT provider, resource, cursor_type, cursor_value, updated_at
      FROM sync_state
      WHERE tenant_id = $1${extra}
      ORDER BY updated_at DESC
      `,
      params,
    );

    return {
      items: result.rows.map((row) => ({
        provider: row.provider,
        resource: row.resource,
        cursor_type: row.cursor_type,
        cursor_value: row.cursor_value,
        updated_at: row.updated_at,
      })),
    };
  }

  async receiveWebhook(
    tenantId: string,
    actorUserId: string,
    provider: Provider,
    eventType: string,
    externalId: string | null,
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): Promise<{ accepted: true; webhook_event_id: string }> {
    const normalizedEventType = eventType.trim();
    if (!normalizedEventType) {
      throw new BadRequestException('event_type header or body.event_type is required');
    }

    const account = await this.getIntegrationAccount(tenantId, provider);
    const secret = account ? this.readString(account.config_json, 'webhook_secret') : null;
    if (secret) {
      this.verifyWebhookSignature(provider, secret, payload, headers);
    }

    const computedExternalId =
      externalId && externalId.trim().length > 0
        ? externalId.trim()
        : createHmac('sha256', 'external-id')
            .update(JSON.stringify(payload))
            .digest('hex');

    const result = await this.databaseService.query<WebhookEventRow>(
      `
      INSERT INTO webhook_events (
        tenant_id,
        provider,
        event_type,
        external_id,
        status,
        payload_json
      )
      VALUES ($1,$2,$3,$4,'received',$5::jsonb)
      ON CONFLICT (tenant_id, provider, external_id)
      DO UPDATE SET payload_json = webhook_events.payload_json
      RETURNING id, provider, event_type, external_id
      `,
      [tenantId, provider, normalizedEventType, computedExternalId, JSON.stringify(payload)],
    );

    const row = result.rows[0];
    if (!row) {
      throw new BadRequestException('Failed to save webhook event');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'webhook.received',
      entityType: 'webhook_event',
      entityId: row.id,
      payload: { provider: row.provider, event_type: row.event_type, external_id: row.external_id },
    });

    return { accepted: true, webhook_event_id: row.id };
  }

  async processNow(
    tenantId: string,
    provider: Provider,
  ): Promise<{ enqueued: true; job_id: string }> {
    const jobId = await this.queueService.enqueueWebhookProcess({
      tenant_id: tenantId,
      provider,
    });
    return { enqueued: true, job_id: jobId };
  }

  private verifyWebhookSignature(
    provider: Provider,
    secret: string,
    payload: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): void {
    const payloadText = JSON.stringify(payload);
    if (provider === 'shopify') {
      const header = headers['x-shopify-hmac-sha256'];
      if (!header) {
        throw new BadRequestException('Missing X-Shopify-Hmac-Sha256');
      }
      const expected = createHmac('sha256', secret).update(payloadText).digest('base64');
      if (expected !== header) {
        throw new BadRequestException('Invalid Shopify webhook signature');
      }
      return;
    }

    if (provider === 'woocommerce') {
      const header = headers['x-wc-webhook-signature'];
      if (!header) {
        throw new BadRequestException('Missing X-Wc-Webhook-Signature');
      }
      const expected = createHmac('sha256', secret).update(payloadText).digest('base64');
      if (expected !== header) {
        throw new BadRequestException('Invalid WooCommerce webhook signature');
      }
    }
  }

  private async getIntegrationAccount(
    tenantId: string,
    provider: Provider,
  ): Promise<IntegrationAccountRow | null> {
    const result = await this.databaseService.query<IntegrationAccountRow>(
      `
      SELECT id, tenant_id, provider, status, config_json
      FROM integration_accounts
      WHERE tenant_id = $1 AND provider = $2
      LIMIT 1
      `,
      [tenantId, provider],
    );
    return result.rows[0] ?? null;
  }

  private readString(obj: Record<string, unknown>, key: string): string | null {
    const value = obj[key];
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const value = obj[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
