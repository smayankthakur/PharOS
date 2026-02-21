import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type PoolClient } from 'pg';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';

const movementSchema = z
  .object({
    warehouse_id: z.string().uuid(),
    sku_id: z.string().uuid(),
    type: z.enum(['in', 'out', 'adjust']),
    qty: z.number().int(),
    ref_type: z.string().trim().optional(),
    ref_id: z.string().trim().optional(),
    note: z.string().trim().optional(),
    occurred_at: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.type === 'in' || value.type === 'out') && value.qty <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['qty'],
        message: 'qty must be > 0 for in/out',
      });
    }

    if (value.type === 'adjust' && value.qty === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['qty'],
        message: 'qty cannot be 0 for adjust',
      });
    }
  });

type WarehouseRow = {
  id: string;
};

type SkuRow = {
  id: string;
};

type BalanceRow = {
  tenant_id: string;
  warehouse_id: string;
  sku_id: string;
  on_hand: number;
  reserved: number;
  updated_at: Date;
};

type MovementRow = {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  sku_id: string;
  type: 'in' | 'out' | 'adjust';
  qty: number;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  occurred_at: Date;
  created_at: Date;
};

type BalanceListRow = {
  warehouse_id: string;
  warehouse_name: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  on_hand: number;
  reserved: number;
  updated_at: Date;
};

export type CreateInventoryMovementInput = z.input<typeof movementSchema>;

export type InventoryBalanceResponse = {
  warehouseId: string;
  warehouseName: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  onHand: number;
  reserved: number;
  updatedAt: Date;
};

export type InventoryMovementResponse = {
  id: string;
  tenantId: string;
  warehouseId: string;
  skuId: string;
  type: 'in' | 'out' | 'adjust';
  qty: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
  balance: {
    onHand: number;
    reserved: number;
  };
};

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async listBalances(tenantId: string, warehouseId?: string): Promise<InventoryBalanceResponse[]> {
    const params: unknown[] = [tenantId];
    let warehouseFilter = '';

    if (warehouseId) {
      params.push(warehouseId);
      warehouseFilter = ' AND b.warehouse_id = $2';
    }

    const result = await this.databaseService.query<BalanceListRow>(
      `
      SELECT
        b.warehouse_id,
        w.name AS warehouse_name,
        b.sku_id,
        s.code AS sku_code,
        s.name AS sku_name,
        b.on_hand,
        b.reserved,
        b.updated_at
      FROM inventory_balances b
      INNER JOIN warehouses w
        ON w.id = b.warehouse_id
       AND w.tenant_id = b.tenant_id
      INNER JOIN skus s
        ON s.id = b.sku_id
       AND s.tenant_id = b.tenant_id
      WHERE b.tenant_id = $1
      ${warehouseFilter}
      ORDER BY w.name ASC, s.code ASC
      `,
      params,
    );

    return result.rows.map((row) => ({
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      skuId: row.sku_id,
      skuCode: row.sku_code,
      skuName: row.sku_name,
      onHand: row.on_hand,
      reserved: row.reserved,
      updatedAt: row.updated_at,
    }));
  }

  // Adjust movements keep signed qty and are applied directly to on_hand.
  async createMovement(
    tenantId: string,
    actorUserId: string,
    input: CreateInventoryMovementInput,
  ): Promise<InventoryMovementResponse> {
    const parsed = movementSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const payload = parsed.data;

    const result = await this.databaseService.withTransaction(
      async (client: PoolClient): Promise<{ movement: MovementRow; balance: BalanceRow }> => {
        await this.assertWarehouseAndSku(client, tenantId, payload.warehouse_id, payload.sku_id);

        const currentBalanceResult = await client.query<BalanceRow>(
          `
          SELECT tenant_id, warehouse_id, sku_id, on_hand, reserved, updated_at
          FROM inventory_balances
          WHERE tenant_id = $1
            AND warehouse_id = $2
            AND sku_id = $3
          FOR UPDATE
          `,
          [tenantId, payload.warehouse_id, payload.sku_id],
        );

        const current = currentBalanceResult.rows[0];
        const currentOnHand = current?.on_hand ?? 0;
        const currentReserved = current?.reserved ?? 0;

        const delta =
          payload.type === 'in' ? payload.qty : payload.type === 'out' ? -payload.qty : payload.qty;
        const nextOnHand = currentOnHand + delta;

        if (nextOnHand < 0) {
          throw new BadRequestException('on_hand cannot become negative');
        }

        const movementResult = await client.query<MovementRow>(
          `
          INSERT INTO inventory_movements (
            tenant_id,
            warehouse_id,
            sku_id,
            type,
            qty,
            ref_type,
            ref_id,
            note,
            occurred_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
          RETURNING
            id,
            tenant_id,
            warehouse_id,
            sku_id,
            type,
            qty,
            ref_type,
            ref_id,
            note,
            occurred_at,
            created_at
          `,
          [
            tenantId,
            payload.warehouse_id,
            payload.sku_id,
            payload.type,
            payload.qty,
            payload.ref_type ?? null,
            payload.ref_id ?? null,
            payload.note ?? null,
            payload.occurred_at ?? null,
          ],
        );

        const balanceResult = await client.query<BalanceRow>(
          `
          INSERT INTO inventory_balances (
            tenant_id,
            warehouse_id,
            sku_id,
            on_hand,
            reserved,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (tenant_id, warehouse_id, sku_id)
          DO UPDATE SET
            on_hand = EXCLUDED.on_hand,
            reserved = EXCLUDED.reserved,
            updated_at = now()
          RETURNING tenant_id, warehouse_id, sku_id, on_hand, reserved, updated_at
          `,
          [tenantId, payload.warehouse_id, payload.sku_id, nextOnHand, currentReserved],
        );

        const movement = movementResult.rows[0];
        const balance = balanceResult.rows[0];

        if (!movement || !balance) {
          throw new BadRequestException('Failed to apply inventory movement');
        }

        return { movement, balance };
      },
    );

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'inventory.movement.created',
      entityType: 'inventory_movement',
      entityId: result.movement.id,
      payload: {
        sku_id: result.movement.sku_id,
        warehouse_id: result.movement.warehouse_id,
        type: result.movement.type,
        qty: result.movement.qty,
        ref_type: result.movement.ref_type,
        ref_id: result.movement.ref_id,
      },
    });

    return {
      id: result.movement.id,
      tenantId: result.movement.tenant_id,
      warehouseId: result.movement.warehouse_id,
      skuId: result.movement.sku_id,
      type: result.movement.type,
      qty: result.movement.qty,
      refType: result.movement.ref_type,
      refId: result.movement.ref_id,
      note: result.movement.note,
      occurredAt: result.movement.occurred_at,
      createdAt: result.movement.created_at,
      balance: {
        onHand: result.balance.on_hand,
        reserved: result.balance.reserved,
      },
    };
  }

  private async assertWarehouseAndSku(
    client: PoolClient,
    tenantId: string,
    warehouseId: string,
    skuId: string,
  ): Promise<void> {
    const warehouseResult = await client.query<WarehouseRow>(
      `
      SELECT id
      FROM warehouses
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
      `,
      [tenantId, warehouseId],
    );

    if (!warehouseResult.rows[0]) {
      throw new NotFoundException('Warehouse not found');
    }

    const skuResult = await client.query<SkuRow>(
      `
      SELECT id
      FROM skus
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
      `,
      [tenantId, skuId],
    );

    if (!skuResult.rows[0]) {
      throw new NotFoundException('SKU not found');
    }
  }
}
