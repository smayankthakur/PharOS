import { Inject, Injectable } from '@nestjs/common';
import { TenantDb } from '../database/tenant-db.service';
import { AppLoggerService } from '../logger/app-logger.service';
import { EVENT_SET } from './event-registry';

export type AuditRecordInput = {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

type AuditLogRow = {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload_json: Record<string, unknown>;
  created_at: Date;
};

export type AuditLogResponse = {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

@Injectable()
export class AuditService {
  constructor(
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AppLoggerService)
    private readonly logger: AppLoggerService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const action = input.action.trim();
    if (!action) {
      this.logger.warn('audit.record.skipped', { reason: 'missing_action' });
      return;
    }

    if (!EVENT_SET.has(action)) {
      this.logger.warn('audit.record.skipped', {
        reason: 'unknown_event',
        action,
      });
      return;
    }

    const payload =
      input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
        ? input.payload
        : {};

    try {
      await this.tenantDb.insert(
        input.tenantId,
        'audit_logs',
        {
          actor_user_id: input.actorUserId ?? null,
          action,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          payload_json: payload,
        },
        ['id'],
      );
    } catch (error) {
      this.logger.error('audit.record.failed', {
        action,
        tenantId: input.tenantId,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  async listCurrentTenant(tenantId: string, limit = 50): Promise<AuditLogResponse[]> {
    const rows = await this.tenantDb.selectMany<AuditLogRow>(
      tenantId,
      'audit_logs',
      {},
      ['id', 'tenant_id', 'actor_user_id', 'action', 'entity_type', 'entity_id', 'payload_json', 'created_at'],
      {
        orderBy: 'created_at DESC',
        limit,
      },
    );

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload_json,
      createdAt: row.created_at,
    }));
  }
}
