import { Inject, Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';

type TenantScopedTable =
  | 'tenant_branding'
  | 'tenant_settings'
  | 'roles'
  | 'users'
  | 'audit_logs'
  | 'skus'
  | 'sku_pricing'
  | 'warehouses'
  | 'inventory_balances'
  | 'inventory_movements'
  | 'dealers'
  | 'dealer_sales'
  | 'competitors'
  | 'competitor_items'
  | 'competitor_snapshots'
  | 'rule_definitions'
  | 'rules'
  | 'rule_runs'
  | 'alerts'
  | 'alert_evidence'
  | 'tasks'
  | 'task_history'
  | 'task_comments'
  | 'alert_explanations'
  | 'import_jobs'
  | 'import_rows'
  | 'integration_accounts'
  | 'webhook_events'
  | 'sync_runs'
  | 'sync_state'
  | 'external_id_map'
  | 'tenant_feature_flags'
  | 'tenant_domains'
  | 'tenant_usage_daily';

type Filter = Record<string, unknown>;

type SelectManyOptions = {
  limit?: number;
  orderBy?: 'created_at DESC' | 'created_at ASC' | 'updated_at DESC' | 'name ASC' | 'code ASC';
};

@Injectable()
export class TenantDb {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  async selectOne<T extends QueryResultRow>(
    tenantId: string,
    table: TenantScopedTable,
    where: Filter,
    columns: readonly string[] = ['*'],
  ): Promise<T | null> {
    const result = await this.selectMany<T>(tenantId, table, where, columns, { limit: 1 });
    return result[0] ?? null;
  }

  async selectMany<T extends QueryResultRow>(
    tenantId: string,
    table: TenantScopedTable,
    where: Filter,
    columns: readonly string[] = ['*'],
    options?: SelectManyOptions,
  ): Promise<T[]> {
    const allWhere = { ...where, tenant_id: tenantId };
    const { clause, values } = this.buildWhere(allWhere, 1);

    const safeColumns = this.buildColumns(columns);
    const orderBy = options?.orderBy ? ` ORDER BY ${options.orderBy}` : '';
    const limit = options?.limit ? ` LIMIT ${options.limit}` : '';

    const sql = `SELECT ${safeColumns} FROM ${this.quoteIdentifier(table)}${clause}${orderBy}${limit}`;
    const result = await this.databaseService.query<T>(sql, values);
    return result.rows;
  }

  async insert<T extends QueryResultRow>(
    tenantId: string,
    table: TenantScopedTable,
    data: Filter,
    returning: readonly string[] = ['*'],
  ): Promise<T | null> {
    const payload: Record<string, unknown> = { ...data, tenant_id: tenantId };
    const keys = Object.keys(payload);
    if (keys.length === 0) {
      return null;
    }

    const columns = keys.map((key) => this.quoteIdentifier(key)).join(', ');
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const values = keys.map((key) => payload[key]);

    const sql = `INSERT INTO ${this.quoteIdentifier(table)} (${columns}) VALUES (${placeholders}) RETURNING ${this.buildColumns(returning)}`;
    const result = await this.databaseService.query<T>(sql, values);

    return result.rows[0] ?? null;
  }

  async update<T extends QueryResultRow>(
    tenantId: string,
    table: TenantScopedTable,
    data: Filter,
    where: Filter,
    returning: readonly string[] = ['*'],
  ): Promise<T | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return null;
    }

    const setClause = keys
      .map((key, index) => `${this.quoteIdentifier(key)} = $${index + 1}`)
      .join(', ');

    const setValues = keys.map((key) => data[key]);
    const allWhere = { ...where, tenant_id: tenantId };
    const whereParts = this.buildWhere(allWhere, keys.length + 1);

    const sql = `UPDATE ${this.quoteIdentifier(table)} SET ${setClause}${whereParts.clause} RETURNING ${this.buildColumns(returning)}`;

    const result = await this.databaseService.query<T>(sql, [...setValues, ...whereParts.values]);
    return result.rows[0] ?? null;
  }

  private buildColumns(columns: readonly string[]): string {
    if (columns.length === 1 && columns[0] === '*') {
      return '*';
    }

    return columns.map((column) => this.quoteIdentifier(column)).join(', ');
  }

  private buildWhere(filter: Filter, startIndex: number): { clause: string; values: unknown[] } {
    const keys = Object.keys(filter);

    if (keys.length === 0) {
      return { clause: '', values: [] };
    }

    const parts: string[] = [];
    const values: unknown[] = [];

    keys.forEach((key, index) => {
      parts.push(`${this.quoteIdentifier(key)} = $${startIndex + index}`);
      values.push(filter[key]);
    });

    return {
      clause: ` WHERE ${parts.join(' AND ')}`,
      values,
    };
  }

  private quoteIdentifier(identifier: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error(`Unsafe identifier: ${identifier}`);
    }

    return `"${identifier}"`;
  }
}
