import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { TenantDb } from '../database/tenant-db.service';

const severitySchema = z.enum(['critical', 'high', 'medium', 'low']);

const createRuleDefinitionSchema = z.object({
  code: z.enum(['R1', 'R2', 'R3', 'R4']),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  severity: severitySchema,
  enabled: z.boolean().default(true),
  config_json: z.record(z.string(), z.unknown()).default({}),
});

const patchRuleDefinitionSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  severity: severitySchema.optional(),
  enabled: z.boolean().optional(),
  config_json: z.record(z.string(), z.unknown()).optional(),
});

type RuleDefinitionRow = {
  id: string;
  tenant_id: string;
  code: 'R1' | 'R2' | 'R3' | 'R4';
  name: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  config_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type CreateRuleDefinitionInput = z.input<typeof createRuleDefinitionSchema>;
export type PatchRuleDefinitionInput = z.input<typeof patchRuleDefinitionSchema>;

export type RuleDefinitionResponse = {
  id: string;
  tenantId: string;
  code: 'R1' | 'R2' | 'R3' | 'R4';
  name: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  configJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class RuleDefinitionsService {
  constructor(
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateRuleDefinitionInput,
  ): Promise<RuleDefinitionResponse> {
    const parsed = createRuleDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = await this.tenantDb.insert<RuleDefinitionRow>(
      tenantId,
      'rule_definitions',
      {
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        severity: parsed.data.severity,
        enabled: parsed.data.enabled,
        config_json: parsed.data.config_json,
      },
      [
        'id',
        'tenant_id',
        'code',
        'name',
        'description',
        'severity',
        'enabled',
        'config_json',
        'created_at',
        'updated_at',
      ],
    );

    if (!row) {
      throw new BadRequestException('Failed to create rule definition');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'rule.definition.created',
      entityType: 'rule_definition',
      entityId: row.id,
      payload: {
        rule_definition_id: row.id,
        code: row.code,
        severity: row.severity,
      },
    });

    return this.toResponse(row);
  }

  async list(tenantId: string): Promise<RuleDefinitionResponse[]> {
    const rows = await this.tenantDb.selectMany<RuleDefinitionRow>(
      tenantId,
      'rule_definitions',
      {},
      [
        'id',
        'tenant_id',
        'code',
        'name',
        'description',
        'severity',
        'enabled',
        'config_json',
        'created_at',
        'updated_at',
      ],
      { orderBy: 'created_at ASC' },
    );

    return rows.map((row) => this.toResponse(row));
  }

  async getById(tenantId: string, id: string): Promise<RuleDefinitionResponse> {
    const row = await this.tenantDb.selectOne<RuleDefinitionRow>(
      tenantId,
      'rule_definitions',
      { id },
      [
        'id',
        'tenant_id',
        'code',
        'name',
        'description',
        'severity',
        'enabled',
        'config_json',
        'created_at',
        'updated_at',
      ],
    );

    if (!row) {
      throw new NotFoundException('Rule definition not found');
    }

    return this.toResponse(row);
  }

  async patch(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: PatchRuleDefinitionInput,
  ): Promise<RuleDefinitionResponse> {
    const parsed = patchRuleDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    if (
      parsed.data.name === undefined &&
      parsed.data.description === undefined &&
      parsed.data.severity === undefined &&
      parsed.data.enabled === undefined &&
      parsed.data.config_json === undefined
    ) {
      throw new BadRequestException('No patch fields provided');
    }

    const row = await this.tenantDb.update<RuleDefinitionRow>(
      tenantId,
      'rule_definitions',
      {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.config_json !== undefined ? { config_json: parsed.data.config_json } : {}),
        updated_at: new Date(),
      },
      { id },
      [
        'id',
        'tenant_id',
        'code',
        'name',
        'description',
        'severity',
        'enabled',
        'config_json',
        'created_at',
        'updated_at',
      ],
    );

    if (!row) {
      throw new NotFoundException('Rule definition not found');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'rule.definition.updated',
      entityType: 'rule_definition',
      entityId: row.id,
      payload: {
        rule_definition_id: row.id,
        code: row.code,
        severity: row.severity,
        enabled: row.enabled,
      },
    });

    return this.toResponse(row);
  }

  private toResponse(row: RuleDefinitionRow): RuleDefinitionResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      description: row.description,
      severity: row.severity,
      enabled: row.enabled,
      configJson: row.config_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
