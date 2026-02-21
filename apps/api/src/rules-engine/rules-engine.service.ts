import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import { UsageService } from '../usage/usage.service';

type RuleCode = 'R1' | 'R2' | 'R3' | 'R4';
type Severity = 'medium' | 'high' | 'critical';
type ImpactType = 'loss' | 'risk' | 'dead_value';
type EvidenceType = 'dealer_sale' | 'competitor_snapshot' | 'inventory_balance';

const listAlertsQuerySchema = z.object({
  rule_code: z.enum(['R1', 'R2', 'R3', 'R4']).optional(),
  severity: z.enum(['medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'resolved', 'closed']).optional(),
  sku_id: z.string().uuid().optional(),
  dealer_id: z.string().uuid().optional(),
  date_from: z.string().trim().optional(),
  date_to: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type RuleRow = {
  id: string;
  tenant_id: string;
  rule_code: RuleCode;
  name: string;
  enabled: boolean;
  config_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type RuleRunRow = {
  id: string;
  tenant_id: string;
  started_at: Date;
  completed_at: Date | null;
  status: 'running' | 'success' | 'failed';
  stats_json: Record<string, unknown>;
  error_text: string | null;
};

type AlertRow = {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_code: RuleCode;
  severity: Severity;
  status: 'open' | 'resolved' | 'closed';
  impact_value: string;
  impact_type: ImpactType;
  message: string;
  sku_id: string | null;
  dealer_id: string | null;
  competitor_item_id: string | null;
  warehouse_id: string | null;
  detected_at: Date;
  updated_at: Date;
  fingerprint: string;
  created_at: Date;
};

type AlertEvidenceRow = {
  id: string;
  tenant_id: string;
  alert_id: string;
  evidence_type: EvidenceType;
  evidence_id: string;
  evidence_json: Record<string, unknown>;
  created_at: Date;
};

type DealerSaleEvalRow = {
  sale_id: string;
  dealer_id: string;
  sku_id: string;
  sale_price: string;
  qty: number;
  sale_date: string;
  mrp: string;
  map: string;
};

type SnapshotEvalRow = {
  snapshot_id: string;
  competitor_item_id: string;
  sku_id: string;
  price: string;
  map: string;
  captured_at: Date;
};

type DeadStockEvalRow = {
  warehouse_id: string;
  sku_id: string;
  on_hand: number;
  cost: string;
  last_sale_date: string | null;
};

type AlertListRow = AlertRow & {
  sku_code: string | null;
  dealer_name: string | null;
};

export type ListAlertsQuery = z.input<typeof listAlertsQuerySchema>;

export type RuleRunResponse = {
  runId: string;
  status: 'success' | 'failed';
  stats: {
    evaluatedR1: number;
    evaluatedR2: number;
    evaluatedR3: number;
    evaluatedR4: number;
    alertsCreated: number;
    alertsReopened: number;
    alertsUpdatedOpen: number;
  };
};

export type AlertListItem = {
  id: string;
  ruleCode: RuleCode;
  severity: Severity;
  status: 'open' | 'resolved' | 'closed';
  impactValue: number;
  impactType: ImpactType;
  message: string;
  skuId: string | null;
  skuCode: string | null;
  dealerId: string | null;
  dealerName: string | null;
  detectedAt: Date;
  fingerprint: string;
};

export type AlertDetail = {
  alert: AlertListItem;
  evidence: Array<{
    id: string;
    evidenceType: EvidenceType;
    evidenceId: string;
    evidenceJson: Record<string, unknown>;
    createdAt: Date;
  }>;
  math_breakdown_json: Record<string, unknown>;
};

type UpsertPayload = {
  tenantId: string;
  rule: RuleRow;
  severity: Severity;
  impactValue: number;
  impactType: ImpactType;
  message: string;
  fingerprint: string;
  skuId?: string | null;
  dealerId?: string | null;
  competitorItemId?: string | null;
  warehouseId?: string | null;
  evidence: {
    evidenceType: EvidenceType;
    evidenceId: string;
    evidenceJson: Record<string, unknown>;
  };
};

@Injectable()
export class RulesEngineService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(UsageService)
    private readonly usageService: UsageService,
  ) {}

  async run(tenantId: string, actorUserId: string): Promise<RuleRunResponse> {
    const run = await this.tenantDb.insert<RuleRunRow>(
      tenantId,
      'rule_runs',
      { status: 'running', stats_json: {} },
      ['id', 'tenant_id', 'started_at', 'completed_at', 'status', 'stats_json', 'error_text'],
    );

    if (!run) {
      throw new BadRequestException('Failed to create rule run');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'rule.run.started',
      entityType: 'rule_run',
      entityId: run.id,
      payload: { run_id: run.id },
    });

    const stats = {
      evaluatedR1: 0,
      evaluatedR2: 0,
      evaluatedR3: 0,
      evaluatedR4: 0,
      alertsCreated: 0,
      alertsReopened: 0,
      alertsUpdatedOpen: 0,
    };

    try {
      const rules = await this.tenantDb.selectMany<RuleRow>(
        tenantId,
        'rules',
        { enabled: true },
        ['id', 'tenant_id', 'rule_code', 'name', 'enabled', 'config_json', 'created_at', 'updated_at'],
      );
      const rulesByCode = new Map<RuleCode, RuleRow>(rules.map((row) => [row.rule_code, row]));

      if (rulesByCode.has('R1') || rulesByCode.has('R2')) {
        const saleRows = await this.databaseService.query<DealerSaleEvalRow>(
          `
          SELECT
            ds.id AS sale_id,
            ds.dealer_id,
            ds.sku_id,
            ds.sale_price,
            ds.qty,
            ds.sale_date::text AS sale_date,
            sp.mrp,
            sp.map
          FROM dealer_sales ds
          INNER JOIN sku_pricing sp ON sp.sku_id = ds.sku_id AND sp.tenant_id = ds.tenant_id
          WHERE ds.tenant_id = $1
            AND ds.sale_date >= (CURRENT_DATE - INTERVAL '30 days')
          `,
          [tenantId],
        );

        for (const row of saleRows.rows) {
          const salePrice = Number(row.sale_price);
          const qty = row.qty;
          const mrp = Number(row.mrp);
          const map = Number(row.map);

          if (rulesByCode.has('R1') && salePrice < mrp) {
            stats.evaluatedR1 += 1;
            const diff = mrp - salePrice;
            const percentBelow = (diff / mrp) * 100;
            const severity: Severity = percentBelow > 3 ? 'high' : 'medium';
            const loss = diff * qty;
            const result = await this.upsertAlertAndEvidence({
              tenantId,
              rule: rulesByCode.get('R1') as RuleRow,
              severity,
              impactValue: loss,
              impactType: 'loss',
              message: `Dealer sale below MRP by ${diff.toFixed(2)} per unit`,
              fingerprint: `R1|dealer_sale|${row.sale_id}`,
              skuId: row.sku_id,
              dealerId: row.dealer_id,
              evidence: {
                evidenceType: 'dealer_sale',
                evidenceId: row.sale_id,
                evidenceJson: {
                  sale_price: salePrice,
                  qty,
                  threshold: mrp,
                  threshold_type: 'mrp',
                  loss,
                  percent_below: percentBelow,
                },
              },
            });
            this.accumulateUpsertStats(stats, result);
          }

          if (rulesByCode.has('R2') && salePrice < map) {
            stats.evaluatedR2 += 1;
            const diff = map - salePrice;
            const loss = diff * qty;
            const result = await this.upsertAlertAndEvidence({
              tenantId,
              rule: rulesByCode.get('R2') as RuleRow,
              severity: 'critical',
              impactValue: loss,
              impactType: 'loss',
              message: `Dealer sale below MAP by ${diff.toFixed(2)} per unit`,
              fingerprint: `R2|dealer_sale|${row.sale_id}`,
              skuId: row.sku_id,
              dealerId: row.dealer_id,
              evidence: {
                evidenceType: 'dealer_sale',
                evidenceId: row.sale_id,
                evidenceJson: {
                  sale_price: salePrice,
                  qty,
                  threshold: map,
                  threshold_type: 'map',
                  loss,
                },
              },
            });
            this.accumulateUpsertStats(stats, result);
          }
        }
      }

      if (rulesByCode.has('R3')) {
        const r3Rule = rulesByCode.get('R3') as RuleRow;
        const estUnitsRaw = r3Rule.config_json.r3_est_units;
        const estUnits = typeof estUnitsRaw === 'number' && estUnitsRaw > 0 ? estUnitsRaw : 10;

        const snapshotRows = await this.databaseService.query<SnapshotEvalRow>(
          `
          SELECT
            cs.id AS snapshot_id,
            cs.competitor_item_id,
            ci.sku_id,
            cs.price,
            sp.map,
            cs.captured_at
          FROM competitor_snapshots cs
          INNER JOIN competitor_items ci ON ci.id = cs.competitor_item_id AND ci.tenant_id = cs.tenant_id
          INNER JOIN sku_pricing sp ON sp.sku_id = ci.sku_id AND sp.tenant_id = ci.tenant_id
          WHERE cs.tenant_id = $1
            AND cs.captured_at >= (now() - INTERVAL '30 days')
          `,
          [tenantId],
        );

        for (const row of snapshotRows.rows) {
          const price = Number(row.price);
          const map = Number(row.map);
          if (price >= map) {
            continue;
          }

          stats.evaluatedR3 += 1;
          const perUnitRisk = map - price;
          const risk = perUnitRisk * estUnits;
          const percentBelow = (perUnitRisk / map) * 100;
          const severity: Severity = percentBelow > 3 ? 'high' : 'medium';

          const result = await this.upsertAlertAndEvidence({
            tenantId,
            rule: r3Rule,
            severity,
            impactValue: risk,
            impactType: 'risk',
            message: `Competitor snapshot below MAP by ${perUnitRisk.toFixed(2)} per unit`,
            fingerprint: `R3|snapshot|${row.snapshot_id}`,
            skuId: row.sku_id,
            competitorItemId: row.competitor_item_id,
            evidence: {
              evidenceType: 'competitor_snapshot',
              evidenceId: row.snapshot_id,
              evidenceJson: {
                snapshot_price: price,
                threshold: map,
                threshold_type: 'map',
                per_unit_risk: perUnitRisk,
                est_units: estUnits,
                risk,
              },
            },
          });
          this.accumulateUpsertStats(stats, result);
        }
      }

      if (rulesByCode.has('R4')) {
        const r4Rule = rulesByCode.get('R4') as RuleRow;
        const cfg = r4Rule.config_json;
        const deadDays = typeof cfg.dead_days === 'number' && cfg.dead_days > 0 ? cfg.dead_days : 90;
        const deadUnitsThreshold =
          typeof cfg.dead_units_threshold === 'number' ? cfg.dead_units_threshold : 10;
        const deadValueHighThreshold =
          typeof cfg.dead_value_high_threshold === 'number' ? cfg.dead_value_high_threshold : 50000;

        const rows = await this.databaseService.query<DeadStockEvalRow>(
          `
          SELECT
            ib.warehouse_id,
            ib.sku_id,
            ib.on_hand,
            sp.cost,
            last_sales.last_sale_date::text AS last_sale_date
          FROM inventory_balances ib
          INNER JOIN sku_pricing sp ON sp.sku_id = ib.sku_id AND sp.tenant_id = ib.tenant_id
          LEFT JOIN (
            SELECT tenant_id, sku_id, MAX(sale_date) AS last_sale_date
            FROM dealer_sales
            GROUP BY tenant_id, sku_id
          ) last_sales ON last_sales.tenant_id = ib.tenant_id AND last_sales.sku_id = ib.sku_id
          WHERE ib.tenant_id = $1
            AND ib.on_hand > $2
          `,
          [tenantId, deadUnitsThreshold],
        );

        const now = new Date();
        for (const row of rows.rows) {
          const lastSaleDate = row.last_sale_date ? new Date(row.last_sale_date) : null;
          const isDead =
            !lastSaleDate ||
            (now.getTime() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24) >= deadDays;
          if (!isDead) {
            continue;
          }

          stats.evaluatedR4 += 1;
          const deadValue = row.on_hand * Number(row.cost);
          const severity: Severity = deadValue >= deadValueHighThreshold ? 'high' : 'medium';

          const result = await this.upsertAlertAndEvidence({
            tenantId,
            rule: r4Rule,
            severity,
            impactValue: deadValue,
            impactType: 'dead_value',
            message: `Dead stock detected with value ${deadValue.toFixed(2)}`,
            fingerprint: `R4|dead|${row.warehouse_id}|${row.sku_id}`,
            skuId: row.sku_id,
            warehouseId: row.warehouse_id,
            evidence: {
              evidenceType: 'inventory_balance',
              evidenceId: row.sku_id,
              evidenceJson: {
                sku_id: row.sku_id,
                warehouse_id: row.warehouse_id,
                on_hand: row.on_hand,
                cost_price: Number(row.cost),
                dead_days: deadDays,
                last_sale_date: row.last_sale_date,
                dead_value: deadValue,
              },
            },
          });
          this.accumulateUpsertStats(stats, result);
        }
      }

      await this.tenantDb.update<RuleRunRow>(
        tenantId,
        'rule_runs',
        {
          status: 'success',
          completed_at: new Date(),
          stats_json: stats,
          error_text: null,
        },
        { id: run.id },
        ['id'],
      );

      await this.auditService.record({
        tenantId,
        actorUserId,
        action: 'rule.run.completed',
        entityType: 'rule_run',
        entityId: run.id,
        payload: { run_id: run.id, status: 'success', stats },
      });
      await this.usageService.incrementUsage(tenantId, 'rule_runs');

      return {
        runId: run.id,
        status: 'success',
        stats,
      };
    } catch (error) {
      await this.tenantDb.update<RuleRunRow>(
        tenantId,
        'rule_runs',
        {
          status: 'failed',
          completed_at: new Date(),
          stats_json: stats,
          error_text: error instanceof Error ? error.message : 'unknown_error',
        },
        { id: run.id },
        ['id'],
      );

      await this.auditService.record({
        tenantId,
        actorUserId,
        action: 'rule.run.completed',
        entityType: 'rule_run',
        entityId: run.id,
        payload: {
          run_id: run.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });

      throw error;
    }
  }

  async listAlerts(tenantId: string, query: ListAlertsQuery): Promise<AlertListItem[]> {
    const normalizedQuery = Object.entries((query as Record<string, unknown>) ?? {}).reduce<
      Record<string, unknown>
    >((acc, [key, value]) => {
      acc[key] = Array.isArray(value) ? value[0] : value;
      return acc;
    }, {});

    const parsed = listAlertsQuerySchema.safeParse(normalizedQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid alerts query',
        issues: parsed.error.issues,
      });
    }

    const values: unknown[] = [tenantId];
    const where: string[] = ['a.tenant_id = $1'];

    if (parsed.data.rule_code) {
      values.push(parsed.data.rule_code);
      where.push(`a.rule_code = $${values.length}`);
    }
    if (parsed.data.severity) {
      values.push(parsed.data.severity);
      where.push(`a.severity = $${values.length}`);
    }
    if (parsed.data.status) {
      values.push(parsed.data.status);
      where.push(`a.status = $${values.length}`);
    }
    if (parsed.data.sku_id) {
      values.push(parsed.data.sku_id);
      where.push(`a.sku_id = $${values.length}`);
    }
    if (parsed.data.dealer_id) {
      values.push(parsed.data.dealer_id);
      where.push(`a.dealer_id = $${values.length}`);
    }
    if (parsed.data.date_from) {
      values.push(parsed.data.date_from);
      where.push(`a.detected_at >= $${values.length}::timestamptz`);
    }
    if (parsed.data.date_to) {
      values.push(parsed.data.date_to);
      where.push(`a.detected_at <= $${values.length}::timestamptz`);
    }

    values.push(parsed.data.limit);
    const limitIndex = values.length;
    values.push(parsed.data.offset);
    const offsetIndex = values.length;

    const result = await this.databaseService.query<AlertListRow>(
      `
      SELECT
        a.id,
        a.tenant_id,
        a.rule_id,
        a.rule_code,
        a.severity,
        a.status,
        a.impact_value,
        a.impact_type,
        a.message,
        a.sku_id,
        a.dealer_id,
        a.competitor_item_id,
        a.warehouse_id,
        a.detected_at,
        a.fingerprint,
        a.created_at,
        s.code AS sku_code,
        d.name AS dealer_name
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id
      LEFT JOIN dealers d ON d.id = a.dealer_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.detected_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
      `,
      values,
    );

    return result.rows.map((row) => this.toAlertListItem(row));
  }

  async getAlertById(tenantId: string, id: string): Promise<AlertDetail> {
    const alert = await this.databaseService.query<AlertListRow>(
      `
      SELECT
        a.id,
        a.tenant_id,
        a.rule_id,
        a.rule_code,
        a.severity,
        a.status,
        a.impact_value,
        a.impact_type,
        a.message,
        a.sku_id,
        a.dealer_id,
        a.competitor_item_id,
        a.warehouse_id,
        a.detected_at,
        a.fingerprint,
        a.created_at,
        s.code AS sku_code,
        d.name AS dealer_name
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id
      LEFT JOIN dealers d ON d.id = a.dealer_id
      WHERE a.tenant_id = $1
        AND a.id = $2
      LIMIT 1
      `,
      [tenantId, id],
    );

    const row = alert.rows[0];
    if (!row) {
      throw new NotFoundException('Alert not found');
    }

    const evidences = await this.tenantDb.selectMany<AlertEvidenceRow>(
      tenantId,
      'alert_evidence',
      { alert_id: id },
      ['id', 'tenant_id', 'alert_id', 'evidence_type', 'evidence_id', 'evidence_json', 'created_at'],
      { orderBy: 'created_at ASC' },
    );

    return {
      alert: this.toAlertListItem(row),
      evidence: evidences.map((evidence) => ({
        id: evidence.id,
        evidenceType: evidence.evidence_type,
        evidenceId: evidence.evidence_id,
        evidenceJson: evidence.evidence_json,
        createdAt: evidence.created_at,
      })),
      math_breakdown_json: this.buildMathBreakdown(row, evidences),
    };
  }

  private buildMathBreakdown(
    alert: AlertListRow,
    evidences: AlertEvidenceRow[],
  ): Record<string, unknown> {
    const primary = evidences[0]?.evidence_json ?? {};

    if (alert.rule_code === 'R1' || alert.rule_code === 'R2') {
      return {
        sale_price: primary.sale_price ?? null,
        qty: primary.qty ?? null,
        threshold: primary.threshold ?? null,
        threshold_type: primary.threshold_type ?? null,
        impact_value: Number(alert.impact_value),
        formula: '(threshold - sale_price) * qty',
      };
    }

    if (alert.rule_code === 'R3') {
      return {
        snapshot_price: primary.snapshot_price ?? null,
        threshold: primary.threshold ?? null,
        per_unit_risk: primary.per_unit_risk ?? null,
        est_units: primary.est_units ?? null,
        impact_value: Number(alert.impact_value),
        formula: '(MAP - snapshot_price) * est_units',
      };
    }

    return {
      on_hand: primary.on_hand ?? null,
      cost_price: primary.cost_price ?? null,
      dead_days: primary.dead_days ?? null,
      last_sale_date: primary.last_sale_date ?? null,
      impact_value: Number(alert.impact_value),
      formula: 'on_hand * cost_price',
    };
  }

  private async upsertAlertAndEvidence(
    payload: UpsertPayload,
  ): Promise<'created' | 'reopened' | 'updated_open'> {
    const existing = await this.tenantDb.selectOne<AlertRow>(
      payload.tenantId,
      'alerts',
      { fingerprint: payload.fingerprint },
      [
        'id',
        'tenant_id',
        'rule_id',
        'rule_code',
        'severity',
        'status',
        'impact_value',
        'impact_type',
        'message',
        'sku_id',
        'dealer_id',
        'competitor_item_id',
        'warehouse_id',
        'detected_at',
        'updated_at',
        'fingerprint',
        'created_at',
      ],
    );

    let action: 'created' | 'reopened' | 'updated_open' = 'created';
    let alertId = '';

    if (!existing) {
      const inserted = await this.tenantDb.insert<AlertRow>(
        payload.tenantId,
        'alerts',
        {
          rule_id: payload.rule.id,
          rule_code: payload.rule.rule_code,
          severity: payload.severity,
          status: 'open',
          impact_value: payload.impactValue,
          impact_type: payload.impactType,
          message: payload.message,
          sku_id: payload.skuId ?? null,
          dealer_id: payload.dealerId ?? null,
          competitor_item_id: payload.competitorItemId ?? null,
          warehouse_id: payload.warehouseId ?? null,
          detected_at: new Date(),
          updated_at: new Date(),
          fingerprint: payload.fingerprint,
        },
        ['id'],
      );

      if (!inserted) {
        throw new BadRequestException('Failed to create alert');
      }
      alertId = inserted.id;

      await this.auditService.record({
        tenantId: payload.tenantId,
        action: 'alert.created',
        entityType: 'alert',
        entityId: alertId,
        payload: {
          rule_code: payload.rule.rule_code,
          severity: payload.severity,
          impact_value: payload.impactValue,
          fingerprint: payload.fingerprint,
        },
      });
      await this.usageService.incrementUsage(payload.tenantId, 'alerts_created');
    } else {
      alertId = existing.id;
      action = existing.status === 'open' ? 'updated_open' : 'reopened';

      await this.tenantDb.update<AlertRow>(
        payload.tenantId,
        'alerts',
        {
          severity: payload.severity,
          status: 'open',
          impact_value: payload.impactValue,
          impact_type: payload.impactType,
          message: payload.message,
          sku_id: payload.skuId ?? null,
          dealer_id: payload.dealerId ?? null,
          competitor_item_id: payload.competitorItemId ?? null,
          warehouse_id: payload.warehouseId ?? null,
          detected_at: new Date(),
          updated_at: new Date(),
        },
        { id: existing.id },
        ['id'],
      );
    }

    const evidenceExisting = await this.tenantDb.selectOne<AlertEvidenceRow>(
      payload.tenantId,
      'alert_evidence',
      {
        alert_id: alertId,
        evidence_type: payload.evidence.evidenceType,
        evidence_id: payload.evidence.evidenceId,
      },
      ['id'],
    );

    if (!evidenceExisting) {
      await this.tenantDb.insert<AlertEvidenceRow>(
        payload.tenantId,
        'alert_evidence',
        {
          alert_id: alertId,
          evidence_type: payload.evidence.evidenceType,
          evidence_id: payload.evidence.evidenceId,
          evidence_json: payload.evidence.evidenceJson,
        },
        ['id'],
      );
    }

    return action;
  }

  private accumulateUpsertStats(
    stats: {
      alertsCreated: number;
      alertsReopened: number;
      alertsUpdatedOpen: number;
    },
    action: 'created' | 'reopened' | 'updated_open',
  ): void {
    if (action === 'created') {
      stats.alertsCreated += 1;
      return;
    }
    if (action === 'reopened') {
      stats.alertsReopened += 1;
      return;
    }
    stats.alertsUpdatedOpen += 1;
  }

  private toAlertListItem(row: AlertListRow): AlertListItem {
    return {
      id: row.id,
      ruleCode: row.rule_code,
      severity: row.severity,
      status: row.status,
      impactValue: Number(row.impact_value),
      impactType: row.impact_type,
      message: row.message,
      skuId: row.sku_id,
      skuCode: row.sku_code,
      dealerId: row.dealer_id,
      dealerName: row.dealer_name,
      detectedAt: row.detected_at,
      fingerprint: row.fingerprint,
    };
  }
}
