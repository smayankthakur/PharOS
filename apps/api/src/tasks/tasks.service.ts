import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';

const assignTaskSchema = z
  .object({
    assignee_user_id: z.string().uuid().optional(),
    assigned_role: z.enum(['Sales', 'Ops']).optional(),
  })
  .refine((value) => value.assignee_user_id !== undefined || value.assigned_role !== undefined, {
    message: 'At least one field is required',
  });

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'blocked', 'resolved', 'closed']),
  resolution_code: z
    .enum([
      'price_adjusted',
      'dealer_warned',
      'promo_launched',
      'stock_transfer',
      'bundle_created',
      'no_action',
    ])
    .optional(),
  resolution_note: z.string().trim().min(1).optional(),
});

const commentSchema = z.object({
  comment: z.string().trim().min(1),
});

const listTasksSchema = z.object({
  status: z.enum(['open', 'in_progress', 'blocked', 'resolved', 'closed']).optional(),
  assigned_role: z.enum(['Sales', 'Ops']).optional(),
  assignee_user_id: z.string().uuid().optional(),
  alert_id: z.string().uuid().optional(),
  sla_state: z.enum(['on_time', 'due_soon', 'breached']).optional(),
  severity: z.enum(['medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed';
type TaskSeverity = 'medium' | 'high' | 'critical';
type AssignedRole = 'Sales' | 'Ops';
type SlaState = 'on_time' | 'due_soon' | 'breached';

type TaskRow = {
  id: string;
  tenant_id: string;
  alert_id: string;
  title: string;
  description: string | null;
  severity: TaskSeverity;
  status: TaskStatus;
  assigned_role: AssignedRole;
  assignee_user_id: string | null;
  sla_hours: number;
  due_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
  resolution_code: string | null;
  resolution_note: string | null;
  created_at: Date;
  updated_at: Date;
};

type AlertSeedRow = {
  id: string;
  rule_code: 'R1' | 'R2' | 'R3' | 'R4';
  severity: TaskSeverity;
  status: string;
  message: string;
  sku_id: string | null;
  sku_code: string | null;
};

type AlertDetailRow = {
  id: string;
  rule_code: 'R1' | 'R2' | 'R3' | 'R4';
  severity: TaskSeverity;
  status: string;
  message: string;
  impact_value: string;
  impact_type: string;
  sku_id: string | null;
  dealer_id: string | null;
  competitor_item_id: string | null;
  warehouse_id: string | null;
  detected_at: Date;
  fingerprint: string;
  sku_code: string | null;
};

type TaskHistoryRow = {
  id: string;
  tenant_id: string;
  task_id: string;
  actor_user_id: string | null;
  action: 'created' | 'assigned' | 'status_changed' | 'commented' | 'resolved' | 'closed';
  from_status: string | null;
  to_status: string | null;
  from_assignee: string | null;
  to_assignee: string | null;
  from_role: string | null;
  to_role: string | null;
  payload_json: Record<string, unknown>;
  created_at: Date;
};

type EvidenceRow = {
  id: string;
  evidence_type: string;
  evidence_id: string;
  evidence_json: Record<string, unknown>;
  created_at: Date;
};

type CommentRow = {
  id: string;
  tenant_id: string;
  task_id: string;
  actor_user_id: string | null;
  comment: string;
  created_at: Date;
};

type UserExistsRow = {
  id: string;
};

export type AssignTaskInput = z.input<typeof assignTaskSchema>;
export type UpdateTaskStatusInput = z.input<typeof updateStatusSchema>;
export type CreateCommentInput = z.input<typeof commentSchema>;
export type TaskListQuery = z.input<typeof listTasksSchema>;

export type TaskResponse = {
  id: string;
  alertId: string;
  title: string;
  description: string | null;
  severity: TaskSeverity;
  status: TaskStatus;
  assignedRole: AssignedRole;
  assigneeUserId: string | null;
  slaHours: number;
  dueAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  resolutionCode: string | null;
  resolutionNote: string | null;
  slaState: SlaState;
  createdAt: Date;
  updatedAt: Date;
  created?: boolean;
};

export type TaskDetailResponse = {
  task: TaskResponse;
  alert: {
    id: string;
    ruleCode: 'R1' | 'R2' | 'R3' | 'R4';
    severity: TaskSeverity;
    status: string;
    message: string;
    impactValue: number;
    impactType: string;
    skuId: string | null;
    skuCode: string | null;
    fingerprint: string;
    detectedAt: Date;
  };
  evidence: Array<{
    id: string;
    evidenceType: string;
    evidenceId: string;
    evidenceJson: Record<string, unknown>;
    createdAt: Date;
  }>;
  history: Array<{
    id: string;
    actorUserId: string | null;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    fromAssignee: string | null;
    toAssignee: string | null;
    fromRole: string | null;
    toRole: string | null;
    payload: Record<string, unknown>;
    createdAt: Date;
  }>;
};

@Injectable()
export class TasksService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async createFromAlert(
    tenantId: string,
    actorUserId: string,
    actorRoles: string[],
    alertId: string,
  ): Promise<TaskResponse> {
    const alert = await this.getAlertForTask(tenantId, alertId);
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const assignedRole = this.roleFromRule(alert.rule_code);
    this.assertCanActOnRole(actorRoles, assignedRole);

    const existing = await this.tenantDb.selectOne<TaskRow>(
      tenantId,
      'tasks',
      { alert_id: alert.id },
      [
        'id',
        'tenant_id',
        'alert_id',
        'title',
        'description',
        'severity',
        'status',
        'assigned_role',
        'assignee_user_id',
        'sla_hours',
        'due_at',
        'resolved_at',
        'closed_at',
        'resolution_code',
        'resolution_note',
        'created_at',
        'updated_at',
      ],
    );

    if (existing) {
      return { ...this.toTaskResponse(existing), created: false };
    }

    const slaHours = this.slaHoursFromSeverity(alert.severity);
    const dueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);
    const title = this.buildTitle(alert.rule_code, alert.sku_code, alert.message);
    const description = `From alert ${alert.id}`;

    const created = await this.tenantDb.insert<TaskRow>(
      tenantId,
      'tasks',
      {
        alert_id: alert.id,
        title,
        description,
        severity: alert.severity,
        status: 'open',
        assigned_role: assignedRole,
        assignee_user_id: null,
        sla_hours: slaHours,
        due_at: dueAt,
      },
      [
        'id',
        'tenant_id',
        'alert_id',
        'title',
        'description',
        'severity',
        'status',
        'assigned_role',
        'assignee_user_id',
        'sla_hours',
        'due_at',
        'resolved_at',
        'closed_at',
        'resolution_code',
        'resolution_note',
        'created_at',
        'updated_at',
      ],
    );

    if (!created) {
      throw new BadRequestException('Failed to create task');
    }

    await this.insertHistory(tenantId, created.id, actorUserId, {
      action: 'created',
      to_status: 'open',
      to_role: assignedRole,
      payload_json: { alert_id: alert.id, due_at: dueAt.toISOString(), sla_hours: slaHours },
    });

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'task.created',
      entityType: 'task',
      entityId: created.id,
      payload: { task_id: created.id, alert_id: created.alert_id, assigned_role: assignedRole, sla_hours: slaHours },
    });

    return { ...this.toTaskResponse(created), created: true };
  }

  async listTasks(tenantId: string, query: TaskListQuery): Promise<TaskResponse[]> {
    const normalized = Object.entries((query as Record<string, unknown>) ?? {}).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value[0] : value;
        return acc;
      },
      {},
    );
    const parsed = listTasksSchema.safeParse(normalized);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid task query', issues: parsed.error.issues });
    }

    const where: Record<string, unknown> = {};
    if (parsed.data.status) {
      where.status = parsed.data.status;
    }
    if (parsed.data.assigned_role) {
      where.assigned_role = parsed.data.assigned_role;
    }
    if (parsed.data.assignee_user_id) {
      where.assignee_user_id = parsed.data.assignee_user_id;
    }
    if (parsed.data.alert_id) {
      where.alert_id = parsed.data.alert_id;
    }
    if (parsed.data.severity) {
      where.severity = parsed.data.severity;
    }

    const rows = await this.tenantDb.selectMany<TaskRow>(
      tenantId,
      'tasks',
      where,
      [
        'id',
        'tenant_id',
        'alert_id',
        'title',
        'description',
        'severity',
        'status',
        'assigned_role',
        'assignee_user_id',
        'sla_hours',
        'due_at',
        'resolved_at',
        'closed_at',
        'resolution_code',
        'resolution_note',
        'created_at',
        'updated_at',
      ],
      { orderBy: 'created_at DESC' },
    );

    const sorted = rows.sort((a, b) => a.due_at.getTime() - b.due_at.getTime());
    const mapped = sorted.map((row) => this.toTaskResponse(row));
    const filteredBySla = parsed.data.sla_state
      ? mapped.filter((item) => item.slaState === parsed.data.sla_state)
      : mapped;

    return filteredBySla.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);
  }

  async getTaskById(tenantId: string, id: string): Promise<TaskDetailResponse> {
    const task = await this.getTaskOrThrow(tenantId, id);
    const alert = await this.databaseService.query<AlertDetailRow>(
      `
      SELECT
        a.id,
        a.rule_code,
        a.severity,
        a.status,
        a.message,
        a.impact_value,
        a.impact_type,
        a.sku_id,
        a.dealer_id,
        a.competitor_item_id,
        a.warehouse_id,
        a.detected_at,
        a.fingerprint,
        s.code AS sku_code
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.id = $2
      LIMIT 1
      `,
      [tenantId, task.alert_id],
    );

    const alertRow = alert.rows[0];
    if (!alertRow) {
      throw new NotFoundException('Linked alert not found');
    }

    const evidenceRows = await this.tenantDb.selectMany<EvidenceRow>(
      tenantId,
      'alert_evidence',
      { alert_id: alertRow.id },
      ['id', 'evidence_type', 'evidence_id', 'evidence_json', 'created_at'],
      { orderBy: 'created_at ASC' },
    );

    const historyRows = await this.tenantDb.selectMany<TaskHistoryRow>(
      tenantId,
      'task_history',
      { task_id: task.id },
      [
        'id',
        'tenant_id',
        'task_id',
        'actor_user_id',
        'action',
        'from_status',
        'to_status',
        'from_assignee',
        'to_assignee',
        'from_role',
        'to_role',
        'payload_json',
        'created_at',
      ],
      { orderBy: 'created_at ASC' },
    );

    return {
      task: this.toTaskResponse(task),
      alert: {
        id: alertRow.id,
        ruleCode: alertRow.rule_code,
        severity: alertRow.severity,
        status: alertRow.status,
        message: alertRow.message,
        impactValue: Number(alertRow.impact_value),
        impactType: alertRow.impact_type,
        skuId: alertRow.sku_id,
        skuCode: alertRow.sku_code,
        fingerprint: alertRow.fingerprint,
        detectedAt: alertRow.detected_at,
      },
      evidence: evidenceRows.map((row) => ({
        id: row.id,
        evidenceType: row.evidence_type,
        evidenceId: row.evidence_id,
        evidenceJson: row.evidence_json,
        createdAt: row.created_at,
      })),
      history: historyRows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        fromAssignee: row.from_assignee,
        toAssignee: row.to_assignee,
        fromRole: row.from_role,
        toRole: row.to_role,
        payload: row.payload_json,
        createdAt: row.created_at,
      })),
    };
  }

  async assignTask(
    tenantId: string,
    actorUserId: string,
    actorRoles: string[],
    taskId: string,
    input: AssignTaskInput,
  ): Promise<TaskResponse> {
    const parsed = assignTaskSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid assignment input', issues: parsed.error.issues });
    }

    if (!this.isOwner(actorRoles) && !actorRoles.includes('Ops')) {
      throw new ForbiddenException('Insufficient role access');
    }

    const existing = await this.getTaskOrThrow(tenantId, taskId);
    const nextRole = parsed.data.assigned_role ?? existing.assigned_role;
    this.assertCanActOnRole(actorRoles, nextRole, true);

    if (parsed.data.assignee_user_id) {
      await this.assertUserInTenant(tenantId, parsed.data.assignee_user_id);
    }

    const updated = await this.tenantDb.update<TaskRow>(
      tenantId,
      'tasks',
      {
        assigned_role: nextRole,
        assignee_user_id:
          parsed.data.assignee_user_id !== undefined
            ? parsed.data.assignee_user_id
            : existing.assignee_user_id,
        updated_at: new Date(),
      },
      { id: taskId },
      [
        'id',
        'tenant_id',
        'alert_id',
        'title',
        'description',
        'severity',
        'status',
        'assigned_role',
        'assignee_user_id',
        'sla_hours',
        'due_at',
        'resolved_at',
        'closed_at',
        'resolution_code',
        'resolution_note',
        'created_at',
        'updated_at',
      ],
    );

    if (!updated) {
      throw new NotFoundException('Task not found');
    }

    await this.insertHistory(tenantId, taskId, actorUserId, {
      action: 'assigned',
      from_assignee: existing.assignee_user_id,
      to_assignee: updated.assignee_user_id,
      from_role: existing.assigned_role,
      to_role: updated.assigned_role,
      payload_json: {},
    });

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'task.assigned',
      entityType: 'task',
      entityId: taskId,
      payload: {
        task_id: taskId,
        from_role: existing.assigned_role,
        to_role: updated.assigned_role,
        from_assignee: existing.assignee_user_id,
        to_assignee: updated.assignee_user_id,
      },
    });

    return this.toTaskResponse(updated);
  }

  async updateStatus(
    tenantId: string,
    actorUserId: string,
    actorRoles: string[],
    taskId: string,
    input: UpdateTaskStatusInput,
  ): Promise<TaskResponse> {
    const parsed = updateStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid status input', issues: parsed.error.issues });
    }

    const existing = await this.getTaskOrThrow(tenantId, taskId);
    this.assertCanActOnRole(actorRoles, existing.assigned_role, true);

    if (parsed.data.status === 'resolved') {
      if (!parsed.data.resolution_code || !parsed.data.resolution_note) {
        throw new BadRequestException('resolved requires resolution_code and resolution_note');
      }
    }

    if (parsed.data.status === 'closed' && existing.status !== 'resolved') {
      throw new BadRequestException('Task must be resolved before closing');
    }

    const now = new Date();
    const updatePayload: Record<string, unknown> = {
      status: parsed.data.status,
      updated_at: now,
    };

    if (parsed.data.status === 'resolved') {
      updatePayload.resolved_at = now;
      updatePayload.resolution_code = parsed.data.resolution_code;
      updatePayload.resolution_note = parsed.data.resolution_note;
    } else if (parsed.data.status === 'closed') {
      updatePayload.closed_at = now;
    }

    const updated = await this.tenantDb.update<TaskRow>(
      tenantId,
      'tasks',
      updatePayload,
      { id: taskId },
      [
        'id',
        'tenant_id',
        'alert_id',
        'title',
        'description',
        'severity',
        'status',
        'assigned_role',
        'assignee_user_id',
        'sla_hours',
        'due_at',
        'resolved_at',
        'closed_at',
        'resolution_code',
        'resolution_note',
        'created_at',
        'updated_at',
      ],
    );

    if (!updated) {
      throw new NotFoundException('Task not found');
    }

    const action = parsed.data.status === 'resolved'
      ? 'resolved'
      : parsed.data.status === 'closed'
        ? 'closed'
        : 'status_changed';

    await this.insertHistory(tenantId, taskId, actorUserId, {
      action,
      from_status: existing.status,
      to_status: updated.status,
      payload_json: {
        resolution_code: updated.resolution_code,
        resolution_note: updated.resolution_note,
      },
    });

    const auditAction = action === 'resolved'
      ? 'task.resolved'
      : action === 'closed'
        ? 'task.closed'
        : 'task.status.changed';

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: auditAction,
      entityType: 'task',
      entityId: taskId,
      payload: {
        task_id: taskId,
        from_status: existing.status,
        to_status: updated.status,
        resolution_code: updated.resolution_code,
      },
    });

    return this.toTaskResponse(updated);
  }

  async addComment(
    tenantId: string,
    actorUserId: string,
    actorRoles: string[],
    taskId: string,
    input: CreateCommentInput,
  ): Promise<{ id: string }> {
    const parsed = commentSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid comment input', issues: parsed.error.issues });
    }

    const task = await this.getTaskOrThrow(tenantId, taskId);
    this.assertCanActOnRole(actorRoles, task.assigned_role, true);

    const comment = await this.tenantDb.insert<CommentRow>(
      tenantId,
      'task_comments',
      {
        task_id: taskId,
        actor_user_id: actorUserId,
        comment: parsed.data.comment,
      },
      ['id', 'tenant_id', 'task_id', 'actor_user_id', 'comment', 'created_at'],
    );

    if (!comment) {
      throw new BadRequestException('Failed to create comment');
    }

    await this.insertHistory(tenantId, taskId, actorUserId, {
      action: 'commented',
      payload_json: { comment: parsed.data.comment },
    });

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'task.commented',
      entityType: 'task',
      entityId: taskId,
      payload: { task_id: taskId, comment_id: comment.id },
    });

    return { id: comment.id };
  }

  private async getTaskOrThrow(tenantId: string, taskId: string): Promise<TaskRow> {
    const task = await this.tenantDb.selectOne<TaskRow>(
      tenantId,
      'tasks',
      { id: taskId },
      [
        'id',
        'tenant_id',
        'alert_id',
        'title',
        'description',
        'severity',
        'status',
        'assigned_role',
        'assignee_user_id',
        'sla_hours',
        'due_at',
        'resolved_at',
        'closed_at',
        'resolution_code',
        'resolution_note',
        'created_at',
        'updated_at',
      ],
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  private async getAlertForTask(tenantId: string, alertId: string): Promise<AlertSeedRow | null> {
    const result = await this.databaseService.query<AlertSeedRow>(
      `
      SELECT
        a.id,
        a.rule_code,
        a.severity,
        a.status,
        a.message,
        a.sku_id,
        s.code AS sku_code
      FROM alerts a
      LEFT JOIN skus s ON s.id = a.sku_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.id = $2
      LIMIT 1
      `,
      [tenantId, alertId],
    );

    return result.rows[0] ?? null;
  }

  private async insertHistory(
    tenantId: string,
    taskId: string,
    actorUserId: string | null,
    payload: {
      action: 'created' | 'assigned' | 'status_changed' | 'commented' | 'resolved' | 'closed';
      from_status?: string | null;
      to_status?: string | null;
      from_assignee?: string | null;
      to_assignee?: string | null;
      from_role?: string | null;
      to_role?: string | null;
      payload_json?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.tenantDb.insert<TaskHistoryRow>(
      tenantId,
      'task_history',
      {
        task_id: taskId,
        actor_user_id: actorUserId,
        action: payload.action,
        from_status: payload.from_status ?? null,
        to_status: payload.to_status ?? null,
        from_assignee: payload.from_assignee ?? null,
        to_assignee: payload.to_assignee ?? null,
        from_role: payload.from_role ?? null,
        to_role: payload.to_role ?? null,
        payload_json: payload.payload_json ?? {},
      },
      ['id'],
    );
  }

  private async assertUserInTenant(tenantId: string, userId: string): Promise<void> {
    const user = await this.tenantDb.selectOne<UserExistsRow>(tenantId, 'users', { id: userId }, ['id']);
    if (!user) {
      throw new BadRequestException('assignee_user_id not found in tenant');
    }
  }

  private roleFromRule(ruleCode: 'R1' | 'R2' | 'R3' | 'R4'): AssignedRole {
    if (ruleCode === 'R1' || ruleCode === 'R2') {
      return 'Sales';
    }
    return 'Ops';
  }

  private slaHoursFromSeverity(severity: TaskSeverity): number {
    if (severity === 'critical') {
      return 4;
    }
    if (severity === 'high') {
      return 24;
    }
    return 72;
  }

  private buildTitle(ruleCode: string, skuCode: string | null, message: string): string {
    const short = message.length > 64 ? `${message.slice(0, 61)}...` : message;
    const sku = skuCode ?? 'UNKNOWN-SKU';
    return `[${ruleCode}] ${sku} - ${short}`;
  }

  private assertCanActOnRole(actorRoles: string[], targetRole: AssignedRole, allowOwnerBypass = false): void {
    if (allowOwnerBypass && this.isOwner(actorRoles)) {
      return;
    }

    if (targetRole === 'Sales' && actorRoles.includes('Sales')) {
      return;
    }

    if (targetRole === 'Ops' && actorRoles.includes('Ops')) {
      return;
    }

    if (this.isOwner(actorRoles)) {
      return;
    }

    throw new ForbiddenException('Insufficient role access');
  }

  private isOwner(roles: string[]): boolean {
    return roles.includes('Owner');
  }

  private computeSlaState(task: TaskRow): SlaState {
    if (task.status === 'resolved' || task.status === 'closed') {
      return 'on_time';
    }

    const nowMs = Date.now();
    const dueMs = task.due_at.getTime();
    if (nowMs > dueMs) {
      return 'breached';
    }

    const remainingMs = dueMs - nowMs;
    const windowMs = task.sla_hours * 60 * 60 * 1000;
    if (remainingMs <= windowMs * 0.25) {
      return 'due_soon';
    }

    return 'on_time';
  }

  private toTaskResponse(row: TaskRow): TaskResponse {
    return {
      id: row.id,
      alertId: row.alert_id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      assignedRole: row.assigned_role,
      assigneeUserId: row.assignee_user_id,
      slaHours: row.sla_hours,
      dueAt: row.due_at,
      resolvedAt: row.resolved_at,
      closedAt: row.closed_at,
      resolutionCode: row.resolution_code,
      resolutionNote: row.resolution_note,
      slaState: this.computeSlaState(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
