import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';

type RuleCode = 'R1' | 'R2' | 'R3' | 'R4';
type Severity = 'medium' | 'high' | 'critical';
type ImpactType = 'loss' | 'risk' | 'dead_value';

type AlertExplainRow = {
  id: string;
  rule_code: RuleCode;
  severity: Severity;
  status: 'open' | 'resolved' | 'closed';
  impact_value: string;
  impact_type: ImpactType;
  message: string;
  detected_at: Date;
  updated_at: Date;
  sku_id: string | null;
  dealer_id: string | null;
  competitor_item_id: string | null;
  warehouse_id: string | null;
  sku_code: string | null;
  sku_name: string | null;
  dealer_name: string | null;
  competitor_name: string | null;
  competitor_url: string | null;
  warehouse_name: string | null;
  mrp: string | null;
  map: string | null;
  cost: string | null;
};

type AlertEvidenceRow = {
  id: string;
  evidence_type: 'dealer_sale' | 'competitor_snapshot' | 'inventory_balance';
  evidence_id: string;
  evidence_json: Record<string, unknown>;
  created_at: Date;
};

type ExplanationRow = {
  tenant_id: string;
  alert_id: string;
  narrative_text: string;
  timeline_json: TimelineEvent[];
  suggestions_json: string[];
  math_json: Record<string, unknown>;
  generated_at: Date;
  generator_version: string;
};

type DealerSaleRow = {
  id: string;
  dealer_id: string;
  sku_id: string;
  sale_price: string;
  qty: number;
  sale_date: string;
  ref_no: string | null;
};

type SnapshotRow = {
  id: string;
  competitor_item_id: string;
  price: string;
  currency: string;
  captured_at: Date;
  method: string;
  product_url: string;
  competitor_name: string | null;
};

type RuleConfigRow = {
  config_json: Record<string, unknown>;
};

type InventoryBalanceRow = {
  warehouse_id: string;
  sku_id: string;
  on_hand: number;
  reserved: number;
  updated_at: Date;
};

type LastSaleRow = {
  last_sale_date: string | null;
};

type TaskSummaryRow = {
  id: string;
  title: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
};

type LossAggregateRow = {
  total_loss: string;
};

type TopSkuRow = {
  sku_id: string;
  sku_code: string | null;
  sku_name: string | null;
  loss: string;
};

type TopDealerRow = {
  dealer_id: string;
  dealer_name: string | null;
  loss: string;
};

type RuleBreakdownRow = {
  rule_code: RuleCode;
  loss: string;
};

const marginLossQuerySchema = z.object({
  range: z.enum(['30d', 'quarter']).default('30d'),
});

export type ExplainMarginLossQuery = z.input<typeof marginLossQuerySchema>;

export type TimelineEvent = {
  at: string;
  type: string;
  text: string;
  meta: Record<string, unknown>;
};

export type ExplainResponse = {
  alert: {
    id: string;
    ruleCode: RuleCode;
    severity: Severity;
    status: 'open' | 'resolved' | 'closed';
    impactValue: number;
    impactType: ImpactType;
    message: string;
    detectedAt: Date;
    skuId: string | null;
    skuCode: string | null;
    skuName: string | null;
    dealerId: string | null;
    dealerName: string | null;
    competitorName: string | null;
    competitorUrl: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
  };
  evidence: Array<{
    id: string;
    evidenceType: 'dealer_sale' | 'competitor_snapshot' | 'inventory_balance';
    evidenceId: string;
    evidenceJson: Record<string, unknown>;
    createdAt: Date;
  }>;
  narrative_text: string;
  timeline_json: TimelineEvent[];
  suggestions_json: string[];
  math_json: Record<string, unknown>;
  cached: boolean;
  generated_at: Date;
  generator_version: string;
};

export type ExplainMarginLossResponse = {
  range: '30d' | 'quarter';
  total_loss: number;
  top_skus: Array<{ sku_id: string; sku_code: string | null; sku_name: string | null; loss: number }>;
  top_dealers: Array<{ dealer_id: string; dealer_name: string | null; loss: number }>;
  rule_breakdown: Array<{ rule_code: RuleCode; loss: number }>;
  narrative: string;
};

@Injectable()
export class ExplainabilityService {
  private readonly generatorVersion = 'v1';

  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
  ) {}

  async explainAlert(tenantId: string, alertId: string): Promise<ExplainResponse> {
    const alert = await this.loadAlert(tenantId, alertId);
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const evidenceRows = await this.tenantDb.selectMany<AlertEvidenceRow>(
      tenantId,
      'alert_evidence',
      { alert_id: alert.id },
      ['id', 'evidence_type', 'evidence_id', 'evidence_json', 'created_at'],
      { orderBy: 'created_at ASC' },
    );

    const cached = await this.tenantDb.selectOne<ExplanationRow>(
      tenantId,
      'alert_explanations',
      { alert_id: alert.id },
      [
        'tenant_id',
        'alert_id',
        'narrative_text',
        'timeline_json',
        'suggestions_json',
        'math_json',
        'generated_at',
        'generator_version',
      ],
    );

    if (
      cached &&
      cached.generator_version === this.generatorVersion &&
      alert.updated_at.getTime() <= cached.generated_at.getTime()
    ) {
      return this.toExplainResponse(alert, evidenceRows, cached, true);
    }

    const generated = await this.generateExplanation(tenantId, alert, evidenceRows);
    await this.databaseService.query(
      `
      INSERT INTO alert_explanations (
        tenant_id,
        alert_id,
        narrative_text,
        timeline_json,
        suggestions_json,
        math_json,
        generated_at,
        generator_version
      )
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,now(),$7)
      ON CONFLICT (tenant_id, alert_id)
      DO UPDATE SET
        narrative_text = EXCLUDED.narrative_text,
        timeline_json = EXCLUDED.timeline_json,
        suggestions_json = EXCLUDED.suggestions_json,
        math_json = EXCLUDED.math_json,
        generated_at = now(),
        generator_version = EXCLUDED.generator_version
      `,
      [
        tenantId,
        alert.id,
        generated.narrative_text,
        JSON.stringify(generated.timeline_json),
        JSON.stringify(generated.suggestions_json),
        JSON.stringify(generated.math_json),
        this.generatorVersion,
      ],
    );

    const fresh = await this.tenantDb.selectOne<ExplanationRow>(
      tenantId,
      'alert_explanations',
      { alert_id: alert.id },
      [
        'tenant_id',
        'alert_id',
        'narrative_text',
        'timeline_json',
        'suggestions_json',
        'math_json',
        'generated_at',
        'generator_version',
      ],
    );

    if (!fresh) {
      throw new BadRequestException('Failed to generate explanation');
    }

    return this.toExplainResponse(alert, evidenceRows, fresh, false);
  }

  async explainMarginLoss(tenantId: string, query: ExplainMarginLossQuery): Promise<ExplainMarginLossResponse> {
    const normalized = Object.entries((query as Record<string, unknown>) ?? {}).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value[0] : value;
        return acc;
      },
      {},
    );
    const parsed = marginLossQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid analytics query', issues: parsed.error.issues });
    }

    const days = parsed.data.range === 'quarter' ? 90 : 30;
    const intervalExpr = `${days} days`;

    const totalRow = await this.databaseService.query<LossAggregateRow>(
      `
      SELECT COALESCE(SUM(impact_value), 0)::text AS total_loss
      FROM alerts
      WHERE tenant_id = $1
        AND impact_type = 'loss'
        AND detected_at >= (now() - $2::interval)
      `,
      [tenantId, intervalExpr],
    );

    const topSkus = await this.databaseService.query<TopSkuRow>(
      `
      SELECT
        a.sku_id,
        s.code AS sku_code,
        s.name AS sku_name,
        COALESCE(SUM(a.impact_value), 0)::text AS loss
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
        AND a.impact_type = 'loss'
        AND a.detected_at >= (now() - $2::interval)
        AND a.sku_id IS NOT NULL
      GROUP BY a.sku_id, s.code, s.name
      ORDER BY SUM(a.impact_value) DESC
      LIMIT 10
      `,
      [tenantId, intervalExpr],
    );

    const topDealers = await this.databaseService.query<TopDealerRow>(
      `
      SELECT
        a.dealer_id,
        d.name AS dealer_name,
        COALESCE(SUM(a.impact_value), 0)::text AS loss
      FROM alerts a
      LEFT JOIN dealers d ON d.id = a.dealer_id AND d.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
        AND a.impact_type = 'loss'
        AND a.detected_at >= (now() - $2::interval)
        AND a.dealer_id IS NOT NULL
      GROUP BY a.dealer_id, d.name
      ORDER BY SUM(a.impact_value) DESC
      LIMIT 10
      `,
      [tenantId, intervalExpr],
    );

    const ruleBreakdown = await this.databaseService.query<RuleBreakdownRow>(
      `
      SELECT
        rule_code,
        COALESCE(SUM(impact_value), 0)::text AS loss
      FROM alerts
      WHERE tenant_id = $1
        AND impact_type = 'loss'
        AND rule_code IN ('R1', 'R2')
        AND detected_at >= (now() - $2::interval)
      GROUP BY rule_code
      ORDER BY rule_code ASC
      `,
      [tenantId, intervalExpr],
    );

    const totalLoss = Number(totalRow.rows[0]?.total_loss ?? 0);
    const topSku = topSkus.rows[0];
    const topDealer = topDealers.rows[0];

    const narrative = `In the last ${days} days, PharOS detected INR ${totalLoss.toLocaleString(
      'en-IN',
      { maximumFractionDigits: 0 },
    )} revenue leak driven mainly by ${topSku?.sku_code ?? 'mixed SKUs'} and dealer ${topDealer?.dealer_name ?? 'mixed channels'}.`;

    return {
      range: parsed.data.range,
      total_loss: totalLoss,
      top_skus: topSkus.rows.map((row) => ({
        sku_id: row.sku_id,
        sku_code: row.sku_code,
        sku_name: row.sku_name,
        loss: Number(row.loss),
      })),
      top_dealers: topDealers.rows.map((row) => ({
        dealer_id: row.dealer_id,
        dealer_name: row.dealer_name,
        loss: Number(row.loss),
      })),
      rule_breakdown: ruleBreakdown.rows.map((row) => ({
        rule_code: row.rule_code,
        loss: Number(row.loss),
      })),
      narrative,
    };
  }

  private async generateExplanation(
    tenantId: string,
    alert: AlertExplainRow,
    evidenceRows: AlertEvidenceRow[],
  ): Promise<{
    narrative_text: string;
    timeline_json: TimelineEvent[];
    suggestions_json: string[];
    math_json: Record<string, unknown>;
  }> {
    const dealerSaleIds = evidenceRows.filter((row) => row.evidence_type === 'dealer_sale').map((row) => row.evidence_id);
    const snapshotIds = evidenceRows
      .filter((row) => row.evidence_type === 'competitor_snapshot')
      .map((row) => row.evidence_id);

    const sales = dealerSaleIds.length > 0
      ? await this.databaseService.query<DealerSaleRow>(
          `
          SELECT id, dealer_id, sku_id, sale_price, qty, sale_date::text, ref_no
          FROM dealer_sales
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])
          `,
          [tenantId, dealerSaleIds],
        )
      : { rows: [] as DealerSaleRow[] };

    const snapshots = snapshotIds.length > 0
      ? await this.databaseService.query<SnapshotRow>(
          `
          SELECT
            cs.id,
            cs.competitor_item_id,
            cs.price,
            cs.currency,
            cs.captured_at,
            cs.method,
            ci.product_url,
            c.name AS competitor_name
          FROM competitor_snapshots cs
          INNER JOIN competitor_items ci ON ci.id = cs.competitor_item_id AND ci.tenant_id = cs.tenant_id
          LEFT JOIN competitors c ON c.id = ci.competitor_id AND c.tenant_id = cs.tenant_id
          WHERE cs.tenant_id = $1 AND cs.id = ANY($2::uuid[])
          `,
          [tenantId, snapshotIds],
        )
      : { rows: [] as SnapshotRow[] };

    const task = await this.databaseService.query<TaskSummaryRow>(
      `
      SELECT id, title, status, created_at, resolved_at
      FROM tasks
      WHERE tenant_id = $1 AND alert_id = $2
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [tenantId, alert.id],
    );

    const balance = alert.rule_code === 'R4' && alert.sku_id && alert.warehouse_id
      ? await this.databaseService.query<InventoryBalanceRow>(
          `
          SELECT warehouse_id, sku_id, on_hand, reserved, updated_at
          FROM inventory_balances
          WHERE tenant_id = $1 AND warehouse_id = $2 AND sku_id = $3
          LIMIT 1
          `,
          [tenantId, alert.warehouse_id, alert.sku_id],
        )
      : { rows: [] as InventoryBalanceRow[] };

    const lastSale = alert.rule_code === 'R4' && alert.sku_id
      ? await this.databaseService.query<LastSaleRow>(
          `
          SELECT MAX(sale_date)::text AS last_sale_date
          FROM dealer_sales
          WHERE tenant_id = $1 AND sku_id = $2
          `,
          [tenantId, alert.sku_id],
        )
      : { rows: [] as LastSaleRow[] };

    const r3Config = alert.rule_code === 'R3'
      ? await this.databaseService.query<RuleConfigRow>(
          `
          SELECT config_json
          FROM rules
          WHERE tenant_id = $1 AND rule_code = 'R3'
          LIMIT 1
          `,
          [tenantId],
        )
      : { rows: [] as RuleConfigRow[] };

    const mathJson = await this.buildMathJson(tenantId, alert, sales.rows, snapshots.rows, balance.rows[0] ?? null, lastSale.rows[0] ?? null, r3Config.rows[0] ?? null);
    const narrativeText = this.buildNarrative(alert, mathJson);
    const suggestions = this.suggestionsByRule(alert.rule_code, alert.severity);
    const timeline = this.buildTimeline(alert, sales.rows, snapshots.rows, task.rows[0] ?? null, balance.rows[0] ?? null);

    return {
      narrative_text: narrativeText,
      timeline_json: timeline,
      suggestions_json: suggestions,
      math_json: mathJson,
    };
  }

  private async buildMathJson(
    tenantId: string,
    alert: AlertExplainRow,
    sales: DealerSaleRow[],
    snapshots: SnapshotRow[],
    balance: InventoryBalanceRow | null,
    lastSale: LastSaleRow | null,
    r3Config: RuleConfigRow | null,
  ): Promise<Record<string, unknown>> {
    const impactValue = Number(alert.impact_value);
    const mrp = alert.mrp ? Number(alert.mrp) : null;
    const map = alert.map ? Number(alert.map) : null;
    const cost = alert.cost ? Number(alert.cost) : null;

    if (alert.rule_code === 'R1' || alert.rule_code === 'R2') {
      const sale = sales[0];
      const thresholdPrice = alert.rule_code === 'R1' ? mrp : map;
      const actualPrice = sale ? Number(sale.sale_price) : null;
      const qty = sale?.qty ?? null;
      const perUnitDelta =
        thresholdPrice !== null && actualPrice !== null ? Number((thresholdPrice - actualPrice).toFixed(2)) : null;

      const base: Record<string, unknown> = {
        threshold_price: thresholdPrice,
        actual_price: actualPrice,
        qty,
        per_unit_delta: perUnitDelta,
        impact_value: impactValue,
        impact_type: alert.impact_type,
      };

      if (alert.rule_code === 'R2' && alert.dealer_id && alert.sku_id) {
        const again = await this.databaseService.query<{ again_count: string }>(
          `
          SELECT COUNT(*)::text AS again_count
          FROM alerts
          WHERE tenant_id = $1
            AND rule_code = 'R2'
            AND dealer_id = $2
            AND sku_id = $3
            AND detected_at >= (now() - interval '30 days')
          `,
          [tenantId, alert.dealer_id, alert.sku_id],
        );
        base.again_count = Number(again.rows[0]?.again_count ?? 0);
      }

      return base;
    }

    if (alert.rule_code === 'R3') {
      const snap = snapshots[0];
      const actualPrice = snap ? Number(snap.price) : null;
      const thresholdPrice = map;
      const perUnitDelta =
        thresholdPrice !== null && actualPrice !== null ? Number((thresholdPrice - actualPrice).toFixed(2)) : null;
      const config = r3Config?.config_json ?? {};
      const estUnitsRaw = config.r3_est_units;
      const estUnits = typeof estUnitsRaw === 'number' && estUnitsRaw > 0 ? estUnitsRaw : 10;

      return {
        threshold_price: thresholdPrice,
        actual_price: actualPrice,
        qty: estUnits,
        per_unit_delta: perUnitDelta,
        impact_value: impactValue,
        impact_type: alert.impact_type,
        competitor: alert.competitor_name,
        product_url: snap?.product_url ?? alert.competitor_url,
      };
    }

    const onHand = balance?.on_hand ?? null;
    const lastSaleDate = lastSale?.last_sale_date ?? null;
    const daysSinceLastSale = lastSaleDate
      ? Math.floor((Date.now() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      threshold_price: null,
      actual_price: null,
      qty: onHand,
      per_unit_delta: cost,
      impact_value: impactValue,
      impact_type: alert.impact_type,
      on_hand: onHand,
      cost_price: cost,
      days_since_last_sale: daysSinceLastSale,
      last_sale_date: lastSaleDate,
      warehouse: alert.warehouse_name,
    };
  }

  private buildNarrative(alert: AlertExplainRow, mathJson: Record<string, unknown>): string {
    if (alert.rule_code === 'R1') {
      return `Dealer ${alert.dealer_name ?? 'Unknown'} sold ${alert.sku_code ?? 'SKU'} below MRP. Expected price was INR ${Number(
        mathJson.threshold_price ?? 0,
      ).toFixed(2)} but actual was INR ${Number(mathJson.actual_price ?? 0).toFixed(
        2,
      )}, causing INR ${Number(alert.impact_value).toFixed(2)} loss.`;
    }

    if (alert.rule_code === 'R2') {
      return `Critical MAP breach detected for dealer ${alert.dealer_name ?? 'Unknown'} on ${alert.sku_code ?? 'SKU'}. Sale at INR ${Number(
        mathJson.actual_price ?? 0,
      ).toFixed(2)} is below MAP INR ${Number(mathJson.threshold_price ?? 0).toFixed(
        2,
      )}. This pattern repeated ${Number(mathJson.again_count ?? 0)} time(s) in the last 30 days.`;
    }

    if (alert.rule_code === 'R3') {
      return `Competitor ${alert.competitor_name ?? 'Unknown'} listed ${alert.sku_code ?? 'SKU'} below MAP. Snapshot price INR ${Number(
        mathJson.actual_price ?? 0,
      ).toFixed(2)} versus MAP INR ${Number(mathJson.threshold_price ?? 0).toFixed(
        2,
      )} creates estimated risk of INR ${Number(alert.impact_value).toFixed(2)}.`;
    }

    return `Dead stock detected for ${alert.sku_code ?? 'SKU'} in ${alert.warehouse_name ?? 'warehouse'}. On-hand units ${
      mathJson.on_hand ?? 0
    } with cost INR ${Number(mathJson.cost_price ?? 0).toFixed(
      2,
    )} gives dead value INR ${Number(alert.impact_value).toFixed(2)}.`;
  }

  private buildTimeline(
    alert: AlertExplainRow,
    sales: DealerSaleRow[],
    snapshots: SnapshotRow[],
    task: TaskSummaryRow | null,
    balance: InventoryBalanceRow | null,
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const sale of sales) {
      events.push({
        at: `${sale.sale_date}T00:00:00.000Z`,
        type: 'dealer_sale',
        text: `Dealer sale recorded at INR ${Number(sale.sale_price).toFixed(2)} for qty ${sale.qty}`,
        meta: { sale_id: sale.id, ref_no: sale.ref_no },
      });
    }

    for (const snapshot of snapshots) {
      events.push({
        at: snapshot.captured_at.toISOString(),
        type: 'competitor_snapshot',
        text: `Competitor snapshot captured at INR ${Number(snapshot.price).toFixed(2)}`,
        meta: {
          snapshot_id: snapshot.id,
          competitor: snapshot.competitor_name,
          url: snapshot.product_url,
          method: snapshot.method,
        },
      });
    }

    if (balance) {
      events.push({
        at: balance.updated_at.toISOString(),
        type: 'inventory_balance',
        text: `Inventory balance observed with on_hand=${balance.on_hand}`,
        meta: { warehouse_id: balance.warehouse_id, sku_id: balance.sku_id, reserved: balance.reserved },
      });
    }

    events.push({
      at: alert.detected_at.toISOString(),
      type: 'rule_detected',
      text: `Rule ${alert.rule_code} detected alert`,
      meta: { severity: alert.severity, impact_value: Number(alert.impact_value), impact_type: alert.impact_type },
    });

    if (task) {
      events.push({
        at: task.created_at.toISOString(),
        type: 'task_created',
        text: `Task created: ${task.title}`,
        meta: { task_id: task.id, status: task.status },
      });

      if (task.resolved_at) {
        events.push({
          at: task.resolved_at.toISOString(),
          type: 'task_resolved',
          text: 'Task resolved',
          meta: { task_id: task.id },
        });
      }
    }

    return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  private suggestionsByRule(ruleCode: RuleCode, severity: Severity): string[] {
    if (ruleCode === 'R2') {
      return [
        'Call dealer within 4 hours',
        'Confirm invoice discount reason',
        'Issue MAP reminder',
        'Block scheme if repeated',
      ];
    }

    if (ruleCode === 'R1') {
      return severity === 'high'
        ? [
            'Call dealer within 24 hours',
            'Verify discount approval',
            'Send MRP adherence notice',
            'Escalate repeated violations to Sales Head',
          ]
        : [
            'Review invoice pricing',
            'Remind dealer of MRP policy',
            'Monitor next 7-day sales',
            'Escalate if repeated',
          ];
    }

    if (ruleCode === 'R3') {
      return [
        'Verify competitor listing',
        'Notify pricing team',
        'Run counter-promo within MAP',
      ];
    }

    return [
      'Transfer stock',
      'Bundle',
      'Create promo',
      'Liquidate slow SKUs',
    ];
  }

  private async loadAlert(tenantId: string, alertId: string): Promise<AlertExplainRow | null> {
    const result = await this.databaseService.query<AlertExplainRow>(
      `
      SELECT
        a.id,
        a.rule_code,
        a.severity,
        a.status,
        a.impact_value,
        a.impact_type,
        a.message,
        a.detected_at,
        a.updated_at,
        a.sku_id,
        a.dealer_id,
        a.competitor_item_id,
        a.warehouse_id,
        s.code AS sku_code,
        s.name AS sku_name,
        d.name AS dealer_name,
        c.name AS competitor_name,
        ci.product_url AS competitor_url,
        w.name AS warehouse_name,
        sp.mrp,
        sp.map,
        sp.cost
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      LEFT JOIN dealers d ON d.id = a.dealer_id AND d.tenant_id = a.tenant_id
      LEFT JOIN competitor_items ci ON ci.id = a.competitor_item_id AND ci.tenant_id = a.tenant_id
      LEFT JOIN competitors c ON c.id = ci.competitor_id AND c.tenant_id = a.tenant_id
      LEFT JOIN warehouses w ON w.id = a.warehouse_id AND w.tenant_id = a.tenant_id
      LEFT JOIN sku_pricing sp ON sp.sku_id = a.sku_id AND sp.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.id = $2
      LIMIT 1
      `,
      [tenantId, alertId],
    );

    return result.rows[0] ?? null;
  }

  private toExplainResponse(
    alert: AlertExplainRow,
    evidenceRows: AlertEvidenceRow[],
    explanation: ExplanationRow,
    cached: boolean,
  ): ExplainResponse {
    return {
      alert: {
        id: alert.id,
        ruleCode: alert.rule_code,
        severity: alert.severity,
        status: alert.status,
        impactValue: Number(alert.impact_value),
        impactType: alert.impact_type,
        message: alert.message,
        detectedAt: alert.detected_at,
        skuId: alert.sku_id,
        skuCode: alert.sku_code,
        skuName: alert.sku_name,
        dealerId: alert.dealer_id,
        dealerName: alert.dealer_name,
        competitorName: alert.competitor_name,
        competitorUrl: alert.competitor_url,
        warehouseId: alert.warehouse_id,
        warehouseName: alert.warehouse_name,
      },
      evidence: evidenceRows.map((row) => ({
        id: row.id,
        evidenceType: row.evidence_type,
        evidenceId: row.evidence_id,
        evidenceJson: row.evidence_json,
        createdAt: row.created_at,
      })),
      narrative_text: explanation.narrative_text,
      timeline_json: explanation.timeline_json,
      suggestions_json: explanation.suggestions_json,
      math_json: explanation.math_json,
      cached,
      generated_at: explanation.generated_at,
      generator_version: explanation.generator_version,
    };
  }
}

