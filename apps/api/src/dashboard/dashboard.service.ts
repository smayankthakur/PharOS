import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const summaryQuerySchema = z.object({
  range: z.enum(['7d', '30d']).default('30d'),
  severity: z.enum(['all', 'medium', 'high', 'critical']).default('all'),
  q: z.string().trim().optional(),
});

type AlertRow = {
  id: string;
  rule_code: 'R1' | 'R2' | 'R3' | 'R4';
  severity: 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved' | 'closed';
  impact_value: string;
  impact_type: 'loss' | 'risk' | 'dead_value';
  message: string;
  detected_at: Date;
  sku_id: string | null;
  sku_code: string | null;
  sku_name: string | null;
  dealer_name: string | null;
  competitor_name: string | null;
};

type KpiRow = {
  revenue_leak: string;
  active_map_violations: string;
  active_mrp_violations: string;
  competitor_undercut_alerts: string;
  dead_stock_value: string;
};

type TrendRow = {
  bucket_date: string;
  breaches: string;
};

type TaskRow = {
  id: string;
  title: string;
  severity: 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed';
  assigned_role: 'Sales' | 'Ops';
  assignee_user_id: string | null;
  due_at: Date;
  sla_hours: number;
};

export type DashboardSummaryQuery = z.input<typeof summaryQuerySchema>;

export type DashboardSummaryResponse = {
  kpis: {
    revenue_leak: number;
    active_map_violations: number;
    active_mrp_violations: number;
    competitor_undercut_alerts: number;
    dead_stock_value: number;
  };
  trend: Array<{ date: string; breaches: number }>;
  top_breaches: Array<{
    id: string;
    rule_code: 'R1' | 'R2' | 'R3' | 'R4';
    severity: 'medium' | 'high' | 'critical';
    status: 'open' | 'resolved' | 'closed';
    impact_value: number;
    impact_type: 'loss' | 'risk' | 'dead_value';
    message: string;
    detected_at: Date;
    sku_id: string | null;
    sku_code: string | null;
    sku_name: string | null;
    dealer_name: string | null;
    competitor_name: string | null;
  }>;
  my_tasks: Array<{
    id: string;
    title: string;
    severity: 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed';
    assigned_role: 'Sales' | 'Ops';
    assignee_user_id: string | null;
    due_at: Date;
    sla_state: 'on_time' | 'due_soon' | 'breached';
  }>;
};

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  async summary(
    tenantId: string,
    userId: string,
    userRoles: string[],
    query: DashboardSummaryQuery,
  ): Promise<DashboardSummaryResponse> {
    const normalized = Object.entries((query as Record<string, unknown>) ?? {}).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value[0] : value;
        return acc;
      },
      {},
    );
    const parsed = summaryQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid dashboard query', issues: parsed.error.issues });
    }

    const days = parsed.data.range === '7d' ? 7 : 30;
    const search = parsed.data.q && parsed.data.q.length > 0 ? parsed.data.q.toLowerCase() : null;
    const severity = parsed.data.severity;
    const start = this.utcStartOfDayDaysAgo(days - 1);
    const end = this.utcEndOfDay(new Date());

    const filter = this.buildAlertFilter({
      tenantId,
      start,
      end,
      severity,
      search,
    });

    const kpis = await this.databaseService.query<KpiRow>(
      `
      SELECT
        COALESCE(SUM(CASE WHEN a.impact_type = 'loss' THEN a.impact_value ELSE 0 END), 0) AS revenue_leak,
        COALESCE(SUM(CASE WHEN a.rule_code = 'R2' AND a.status = 'open' THEN 1 ELSE 0 END), 0) AS active_map_violations,
        COALESCE(SUM(CASE WHEN a.rule_code = 'R1' AND a.status = 'open' THEN 1 ELSE 0 END), 0) AS active_mrp_violations,
        COALESCE(SUM(CASE WHEN a.rule_code = 'R3' AND a.status = 'open' THEN 1 ELSE 0 END), 0) AS competitor_undercut_alerts,
        COALESCE(SUM(CASE WHEN a.rule_code = 'R4' AND a.status = 'open' THEN a.impact_value ELSE 0 END), 0) AS dead_stock_value
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      LEFT JOIN dealers d ON d.id = a.dealer_id AND d.tenant_id = a.tenant_id
      LEFT JOIN competitor_items ci ON ci.id = a.competitor_item_id AND ci.tenant_id = a.tenant_id
      LEFT JOIN competitors c ON c.id = ci.competitor_id AND c.tenant_id = a.tenant_id
      WHERE ${filter.clause}
      `,
      filter.values,
    );

    const topBreaches = await this.databaseService.query<AlertRow>(
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
        a.sku_id,
        s.code AS sku_code,
        s.name AS sku_name,
        d.name AS dealer_name,
        c.name AS competitor_name
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      LEFT JOIN dealers d ON d.id = a.dealer_id AND d.tenant_id = a.tenant_id
      LEFT JOIN competitor_items ci ON ci.id = a.competitor_item_id AND ci.tenant_id = a.tenant_id
      LEFT JOIN competitors c ON c.id = ci.competitor_id AND c.tenant_id = a.tenant_id
      WHERE ${filter.clause}
      ORDER BY a.impact_value DESC, a.detected_at DESC
      LIMIT 20
      `,
      filter.values,
    );

    const trendRows = await this.databaseService.query<TrendRow>(
      `
      SELECT
        (date_trunc('day', a.detected_at) AT TIME ZONE 'UTC')::date::text AS bucket_date,
        COUNT(*)::text AS breaches
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      LEFT JOIN dealers d ON d.id = a.dealer_id AND d.tenant_id = a.tenant_id
      LEFT JOIN competitor_items ci ON ci.id = a.competitor_item_id AND ci.tenant_id = a.tenant_id
      LEFT JOIN competitors c ON c.id = ci.competitor_id AND c.tenant_id = a.tenant_id
      WHERE ${filter.clause}
      GROUP BY bucket_date
      ORDER BY bucket_date ASC
      `,
      filter.values,
    );

    const trendMap = new Map<string, number>(
      trendRows.rows.map((row) => [row.bucket_date, Number(row.breaches)]),
    );

    const trend = this.dateBuckets(days).map((date) => ({
      date,
      breaches: trendMap.get(date) ?? 0,
    }));

    const myTasksWhere: string[] = ['tenant_id = $1'];
    const myTaskValues: unknown[] = [tenantId];

    if (userRoles.includes('Owner')) {
      myTasksWhere.push('(assignee_user_id = $2 OR assignee_user_id IS NULL)');
      myTaskValues.push(userId);
    } else {
      const rolePool: string[] = [];
      if (userRoles.includes('Sales')) {
        rolePool.push('Sales');
      }
      if (userRoles.includes('Ops')) {
        rolePool.push('Ops');
      }

      if (rolePool.length > 0) {
        myTasksWhere.push(`(assignee_user_id = $2 OR (assignee_user_id IS NULL AND assigned_role = ANY($3::text[])))`);
        myTaskValues.push(userId, rolePool);
      } else {
        myTasksWhere.push('assignee_user_id = $2');
        myTaskValues.push(userId);
      }
    }

    const myTasks = await this.databaseService.query<TaskRow>(
      `
      SELECT
        id,
        title,
        severity,
        status,
        assigned_role,
        assignee_user_id,
        due_at,
        sla_hours
      FROM tasks
      WHERE ${myTasksWhere.join(' AND ')}
      ORDER BY due_at ASC
      LIMIT 20
      `,
      myTaskValues,
    );

    const kpi = kpis.rows[0];

    return {
      kpis: {
        revenue_leak: Number(kpi?.revenue_leak ?? 0),
        active_map_violations: Number(kpi?.active_map_violations ?? 0),
        active_mrp_violations: Number(kpi?.active_mrp_violations ?? 0),
        competitor_undercut_alerts: Number(kpi?.competitor_undercut_alerts ?? 0),
        dead_stock_value: Number(kpi?.dead_stock_value ?? 0),
      },
      trend,
      top_breaches: topBreaches.rows.map((row) => ({
        ...row,
        impact_value: Number(row.impact_value),
      })),
      my_tasks: myTasks.rows.map((task) => ({
        id: task.id,
        title: task.title,
        severity: task.severity,
        status: task.status,
        assigned_role: task.assigned_role,
        assignee_user_id: task.assignee_user_id,
        due_at: task.due_at,
        sla_state: this.computeSlaState(task.due_at, task.sla_hours, task.status),
      })),
    };
  }

  private buildAlertFilter(input: {
    tenantId: string;
    start: Date;
    end: Date;
    severity: 'all' | 'medium' | 'high' | 'critical';
    search: string | null;
  }): { clause: string; values: unknown[] } {
    const conditions: string[] = [
      'a.tenant_id = $1',
      'a.detected_at >= $2',
      'a.detected_at <= $3',
    ];
    const values: unknown[] = [input.tenantId, input.start.toISOString(), input.end.toISOString()];

    if (input.severity !== 'all') {
      values.push(input.severity);
      conditions.push(`a.severity = $${values.length}`);
    }

    if (input.search) {
      values.push(`%${input.search}%`);
      const idx = values.length;
      conditions.push(
        `(
          lower(COALESCE(s.code, '')) LIKE $${idx}
          OR lower(COALESCE(s.name, '')) LIKE $${idx}
          OR (a.rule_code IN ('R1','R2') AND lower(COALESCE(d.name, '')) LIKE $${idx})
          OR (a.rule_code = 'R3' AND lower(COALESCE(c.name, '')) LIKE $${idx})
        )`,
      );
    }

    return {
      clause: conditions.join(' AND '),
      values,
    };
  }

  private utcStartOfDayDaysAgo(daysAgo: number): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 0, 0, 0, 0));
  }

  private utcEndOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  }

  private dateBuckets(days: number): string[] {
    const buckets: string[] = [];
    const start = this.utcStartOfDayDaysAgo(days - 1);
    for (let i = 0; i < days; i += 1) {
      const value = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.push(value.toISOString().slice(0, 10));
    }
    return buckets;
  }

  private computeSlaState(
    dueAt: Date,
    slaHours: number,
    status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed',
  ): 'on_time' | 'due_soon' | 'breached' {
    if (status === 'resolved' || status === 'closed') {
      return 'on_time';
    }

    const now = Date.now();
    const due = dueAt.getTime();
    if (now > due) {
      return 'breached';
    }

    const remaining = due - now;
    const windowMs = slaHours * 60 * 60 * 1000;
    if (remaining <= windowMs * 0.25) {
      return 'due_soon';
    }

    return 'on_time';
  }
}

