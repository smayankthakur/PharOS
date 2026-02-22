import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Pool, type PoolClient } from 'pg';

type TenantSeedInput = {
  name: string;
  slug: string;
  ownerEmail: string;
  salesEmail: string;
  opsEmail: string;
  viewerEmail: string;
  primaryColor: string;
  secondaryColor: string;
};

type SkuSeedInput = {
  code: string;
  name: string;
  description: string;
  pricing: {
    cost: number;
    map: number;
    mrp: number;
    activePrice: number;
    currencyCode: string;
  };
};

type WarehouseSeedInput = {
  name: string;
  location: string;
  openingBalances: Array<{
    skuCode: string;
    onHand: number;
  }>;
};

type DealerSeedInput = {
  code: string;
  name: string;
  region: string;
  contactName: string;
  phone: string;
  email: string;
};

type DealerSaleSeedInput = {
  dealerCode: string;
  skuCode: string;
  salePrice: number;
  qty: number;
  saleDate: string;
  source: 'manual' | 'csv' | 'shopify' | 'woocommerce' | 'rest';
  refNo: string;
};

type CompetitorSeedInput = {
  name: string;
  website: string;
};

type CompetitorItemSeedInput = {
  skuCode: string;
  productUrl: string;
  externalSku?: string;
};

type CompetitorSnapshotSeedInput = {
  skuCode: string;
  price: number;
  currency: string;
  capturedAt: string;
  method: string;
  evidence: Record<string, unknown>;
};

type RuleDefinitionSeedInput = {
  code: 'R1' | 'R2' | 'R3' | 'R4';
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  config: Record<string, unknown>;
};

type RulesEngineRuleSeedInput = {
  ruleCode: 'R1' | 'R2' | 'R3' | 'R4';
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

const SHAKTI_SKUS: SkuSeedInput[] = [
  {
    code: 'SKU-342',
    name: 'LED Bulb 9W',
    description: 'Energy efficient LED bulb 9W warm white',
    pricing: { cost: 62, map: 95, mrp: 119, activePrice: 98, currencyCode: 'INR' },
  },
  {
    code: 'SKU-118',
    name: 'USB Cable 1m',
    description: 'Durable USB cable 1 meter fast charge',
    pricing: { cost: 28, map: 45, mrp: 55, activePrice: 49, currencyCode: 'INR' },
  },
  {
    code: 'SKU-777',
    name: 'Power Strip 4-Socket',
    description: '4-socket surge protected power strip',
    pricing: { cost: 180, map: 249, mrp: 299, activePrice: 269, currencyCode: 'INR' },
  },
];

const SHAKTI_WAREHOUSE: WarehouseSeedInput = {
  name: 'Delhi WH-01',
  location: 'Delhi',
  openingBalances: [
    { skuCode: 'SKU-342', onHand: 250 },
    { skuCode: 'SKU-118', onHand: 600 },
    { skuCode: 'SKU-777', onHand: 40 },
  ],
};

const SHAKTI_DEALERS: DealerSeedInput[] = [
  {
    code: 'D001',
    name: 'Ravi Traders',
    region: 'East Delhi',
    contactName: 'Ravi Kumar',
    phone: '+919810000001',
    email: 'ravi.traders@example.test',
  },
  {
    code: 'D002',
    name: 'Kanha Mart',
    region: 'Noida',
    contactName: 'Kanha Singh',
    phone: '+919810000002',
    email: 'kanha.mart@example.test',
  },
];

const SHAKTI_DEALER_SALES: DealerSaleSeedInput[] = [
  {
    dealerCode: 'D001',
    skuCode: 'SKU-342',
    salePrice: 114,
    qty: 60,
    saleDate: '2026-02-07',
    source: 'manual',
    refNo: 'SALE-D7-D001-SKU342',
  },
  {
    dealerCode: 'D001',
    skuCode: 'SKU-342',
    salePrice: 89,
    qty: 200,
    saleDate: '2026-02-10',
    source: 'manual',
    refNo: 'SALE-D10-D001-SKU342',
  },
  {
    dealerCode: 'D002',
    skuCode: 'SKU-118',
    salePrice: 52,
    qty: 90,
    saleDate: '2026-02-12',
    source: 'manual',
    refNo: 'SALE-D12-D002-SKU118',
  },
];

const SHAKTI_COMPETITOR: CompetitorSeedInput = {
  name: 'CompetitorA',
  website: 'https://example.com',
};

const SHAKTI_COMPETITOR_ITEMS: CompetitorItemSeedInput[] = [
  {
    skuCode: 'SKU-342',
    productUrl: 'https://example.com/products/sku-342',
    externalSku: 'CMP-SKU-342',
  },
  {
    skuCode: 'SKU-118',
    productUrl: 'https://example.com/products/sku-118',
    externalSku: 'CMP-SKU-118',
  },
  {
    skuCode: 'SKU-777',
    productUrl: 'https://example.com/products/sku-777',
    externalSku: 'CMP-SKU-777',
  },
];

const SHAKTI_COMPETITOR_SNAPSHOTS: CompetitorSnapshotSeedInput[] = [
  {
    skuCode: 'SKU-342',
    price: 92,
    currency: 'INR',
    capturedAt: '2026-02-05T10:00:00.000Z',
    method: 'seed',
    evidence: {
      url: 'https://example.com/products/sku-342',
      note: 'seed snapshot',
    },
  },
  {
    skuCode: 'SKU-342',
    price: 97,
    currency: 'INR',
    capturedAt: '2026-02-13T10:00:00.000Z',
    method: 'seed',
    evidence: {
      url: 'https://example.com/products/sku-342',
      note: 'seed snapshot',
    },
  },
  {
    skuCode: 'SKU-118',
    price: 60,
    currency: 'INR',
    capturedAt: '2026-02-09T10:00:00.000Z',
    method: 'seed',
    evidence: {
      url: 'https://example.com/products/sku-118',
      note: 'seed snapshot',
    },
  },
];

const V1_RULE_DEFINITIONS: RuleDefinitionSeedInput[] = [
  {
    code: 'R1',
    name: 'Dealer below MRP',
    description: 'Trigger when dealer sale price is below MRP.',
    severity: 'high',
    enabled: true,
    config: { comparator: '<', reference: 'mrp' },
  },
  {
    code: 'R2',
    name: 'Dealer below MAP',
    description: 'Trigger when dealer sale price is below MAP.',
    severity: 'critical',
    enabled: true,
    config: { comparator: '<', reference: 'map' },
  },
  {
    code: 'R3',
    name: 'Competitor under MAP',
    description: 'Trigger when competitor price is below MAP.',
    severity: 'high',
    enabled: true,
    config: { comparator: '<', reference: 'map', subject: 'competitor' },
  },
  {
    code: 'R4',
    name: 'Dead stock over threshold',
    description: 'Trigger when stock age is at least 90 days and on_hand exceeds 10.',
    severity: 'medium',
    enabled: true,
    config: { min_age_days: 90, min_on_hand: 10 },
  },
];

const V1_ENGINE_RULES: RulesEngineRuleSeedInput[] = [
  { ruleCode: 'R1', name: 'Dealer below MRP', enabled: true, config: {} },
  { ruleCode: 'R2', name: 'Dealer below MAP', enabled: true, config: {} },
  { ruleCode: 'R3', name: 'Competitor below MAP', enabled: true, config: { r3_est_units: 10 } },
  {
    ruleCode: 'R4',
    name: 'Dead stock over threshold',
    enabled: true,
    config: { dead_days: 90, dead_units_threshold: 10, dead_value_high_threshold: 50000 },
  },
];

const seedSkuSet = async (
  client: PoolClient,
  tenantId: string,
  skuItems: SkuSeedInput[],
): Promise<void> => {
  for (const item of skuItems) {
    const skuId = randomUUID();

    await client.query(
      `
      INSERT INTO skus (id, tenant_id, code, name, description, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        updated_at = now()
      `,
      [skuId, tenantId, item.code, item.name, item.description],
    );

    const skuResult = await client.query<{ id: string }>(
      'SELECT id FROM skus WHERE tenant_id = $1 AND code = $2 LIMIT 1',
      [tenantId, item.code],
    );

    const resolvedSkuId = skuResult.rows[0]?.id;
    if (!resolvedSkuId) {
      throw new Error(`Failed to resolve sku id for code: ${item.code}`);
    }

    await client.query(
      `
      INSERT INTO sku_pricing (
        id,
        tenant_id,
        sku_id,
        cost,
        map,
        mrp,
        active_price,
        currency_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, sku_id) DO UPDATE SET
        cost = EXCLUDED.cost,
        map = EXCLUDED.map,
        mrp = EXCLUDED.mrp,
        active_price = EXCLUDED.active_price,
        currency_code = EXCLUDED.currency_code,
        updated_at = now()
      `,
      [
        randomUUID(),
        tenantId,
        resolvedSkuId,
        item.pricing.cost,
        item.pricing.map,
        item.pricing.mrp,
        item.pricing.activePrice,
        item.pricing.currencyCode,
      ],
    );
  }
};

const seedWarehouseInventory = async (
  client: PoolClient,
  tenantId: string,
  warehouseInput: WarehouseSeedInput,
): Promise<void> => {
  const warehouseId = randomUUID();

  await client.query(
    `
    INSERT INTO warehouses (id, tenant_id, name, location, status)
    VALUES ($1, $2, $3, $4, 'active')
    ON CONFLICT (tenant_id, name) DO UPDATE SET
      location = EXCLUDED.location,
      status = EXCLUDED.status,
      updated_at = now()
    `,
    [warehouseId, tenantId, warehouseInput.name, warehouseInput.location],
  );

  const warehouseResult = await client.query<{ id: string }>(
    'SELECT id FROM warehouses WHERE tenant_id = $1 AND name = $2 LIMIT 1',
    [tenantId, warehouseInput.name],
  );

  const resolvedWarehouseId = warehouseResult.rows[0]?.id;
  if (!resolvedWarehouseId) {
    throw new Error(`Failed to resolve warehouse id for: ${warehouseInput.name}`);
  }

  for (const balance of warehouseInput.openingBalances) {
    const skuResult = await client.query<{ id: string }>(
      'SELECT id FROM skus WHERE tenant_id = $1 AND code = $2 LIMIT 1',
      [tenantId, balance.skuCode],
    );

    const skuId = skuResult.rows[0]?.id;
    if (!skuId) {
      throw new Error(`Failed to resolve sku id for opening balance: ${balance.skuCode}`);
    }

    await client.query(
      `
      INSERT INTO inventory_balances (tenant_id, warehouse_id, sku_id, on_hand, reserved, updated_at)
      VALUES ($1, $2, $3, $4, 0, now())
      ON CONFLICT (tenant_id, warehouse_id, sku_id) DO UPDATE SET
        on_hand = EXCLUDED.on_hand,
        reserved = EXCLUDED.reserved,
        updated_at = now()
      `,
      [tenantId, resolvedWarehouseId, skuId, balance.onHand],
    );

    await client.query(
      `
      DELETE FROM inventory_movements
      WHERE tenant_id = $1
        AND warehouse_id = $2
        AND sku_id = $3
        AND ref_type = 'seed'
        AND ref_id = $4
      `,
      [tenantId, resolvedWarehouseId, skuId, `opening-${balance.skuCode}`],
    );

    await client.query(
      `
      INSERT INTO inventory_movements (
        id,
        tenant_id,
        warehouse_id,
        sku_id,
        type,
        qty,
        ref_type,
        ref_id,
        note
      )
      VALUES ($1, $2, $3, $4, 'in', $5, 'seed', $6, $7)
      `,
      [
        randomUUID(),
        tenantId,
        resolvedWarehouseId,
        skuId,
        balance.onHand,
        `opening-${balance.skuCode}`,
        'Opening stock seed',
      ],
    );
  }
};

const seedDealersAndSales = async (
  client: PoolClient,
  tenantId: string,
  dealers: DealerSeedInput[],
  sales: DealerSaleSeedInput[],
): Promise<void> => {
  for (const dealer of dealers) {
    await client.query(
      `
      INSERT INTO dealers (
        tenant_id,
        name,
        region,
        contact_name,
        phone,
        email,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      ON CONFLICT (tenant_id, name) DO UPDATE SET
        region = EXCLUDED.region,
        contact_name = EXCLUDED.contact_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        status = EXCLUDED.status,
        updated_at = now()
      `,
      [tenantId, dealer.name, dealer.region, dealer.contactName, dealer.phone, dealer.email],
    );
  }

  const dealerNameByCode = new Map<string, string>(dealers.map((dealer) => [dealer.code, dealer.name]));

  for (const sale of sales) {
    const dealerName = dealerNameByCode.get(sale.dealerCode);
    if (!dealerName) {
      throw new Error(`Unknown dealer code in sale seed: ${sale.dealerCode}`);
    }

    const dealerResult = await client.query<{ id: string }>(
      'SELECT id FROM dealers WHERE tenant_id = $1 AND name = $2 LIMIT 1',
      [tenantId, dealerName],
    );
    const skuResult = await client.query<{ id: string }>(
      'SELECT id FROM skus WHERE tenant_id = $1 AND code = $2 LIMIT 1',
      [tenantId, sale.skuCode],
    );

    const dealerId = dealerResult.rows[0]?.id;
    const skuId = skuResult.rows[0]?.id;

    if (!dealerId || !skuId) {
      throw new Error(`Failed to resolve dealer/sku for dealer sale seed ref: ${sale.refNo}`);
    }

    await client.query(
      `
      DELETE FROM dealer_sales
      WHERE tenant_id = $1
        AND ref_no = $2
      `,
      [tenantId, sale.refNo],
    );

    await client.query(
      `
      INSERT INTO dealer_sales (
        id,
        tenant_id,
        dealer_id,
        sku_id,
        sale_price,
        qty,
        sale_date,
        source,
        ref_no
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)
      `,
      [
        randomUUID(),
        tenantId,
        dealerId,
        skuId,
        sale.salePrice,
        sale.qty,
        sale.saleDate,
        sale.source,
        sale.refNo,
      ],
    );
  }
};

const seedCompetitorsAndSnapshots = async (
  client: PoolClient,
  tenantId: string,
  competitor: CompetitorSeedInput,
  items: CompetitorItemSeedInput[],
  snapshots: CompetitorSnapshotSeedInput[],
): Promise<void> => {
  await client.query(
    `
    INSERT INTO competitors (
      tenant_id,
      name,
      website,
      status
    )
    VALUES ($1, $2, $3, 'active')
    ON CONFLICT (tenant_id, name) DO UPDATE SET
      website = EXCLUDED.website,
      status = EXCLUDED.status,
      updated_at = now()
    `,
    [tenantId, competitor.name, competitor.website],
  );

  const competitorResult = await client.query<{ id: string }>(
    'SELECT id FROM competitors WHERE tenant_id = $1 AND name = $2 LIMIT 1',
    [tenantId, competitor.name],
  );
  const competitorId = competitorResult.rows[0]?.id;
  if (!competitorId) {
    throw new Error('Failed to resolve competitor id for seed');
  }

  for (const item of items) {
    const skuResult = await client.query<{ id: string }>(
      'SELECT id FROM skus WHERE tenant_id = $1 AND code = $2 LIMIT 1',
      [tenantId, item.skuCode],
    );
    const skuId = skuResult.rows[0]?.id;
    if (!skuId) {
      throw new Error(`Failed to resolve sku id for competitor item seed: ${item.skuCode}`);
    }

    await client.query(
      `
      INSERT INTO competitor_items (
        tenant_id,
        competitor_id,
        sku_id,
        product_url,
        external_sku,
        selector_json,
        status
      )
      VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'active')
      ON CONFLICT (tenant_id, competitor_id, sku_id) DO UPDATE SET
        product_url = EXCLUDED.product_url,
        external_sku = EXCLUDED.external_sku,
        status = EXCLUDED.status,
        updated_at = now()
      `,
      [tenantId, competitorId, skuId, item.productUrl, item.externalSku ?? null],
    );
  }

  await client.query(
    `
    DELETE FROM competitor_snapshots
    WHERE tenant_id = $1
      AND method = 'seed'
    `,
    [tenantId],
  );

  for (const snapshot of snapshots) {
    const skuResult = await client.query<{ id: string }>(
      'SELECT id FROM skus WHERE tenant_id = $1 AND code = $2 LIMIT 1',
      [tenantId, snapshot.skuCode],
    );
    const skuId = skuResult.rows[0]?.id;
    if (!skuId) {
      throw new Error(`Failed to resolve sku id for competitor snapshot seed: ${snapshot.skuCode}`);
    }

    const itemResult = await client.query<{ id: string }>(
      `
      SELECT id
      FROM competitor_items
      WHERE tenant_id = $1
        AND competitor_id = $2
        AND sku_id = $3
      LIMIT 1
      `,
      [tenantId, competitorId, skuId],
    );
    const competitorItemId = itemResult.rows[0]?.id;
    if (!competitorItemId) {
      throw new Error(`Failed to resolve competitor item id for snapshot seed: ${snapshot.skuCode}`);
    }

    await client.query(
      `
      INSERT INTO competitor_snapshots (
        tenant_id,
        competitor_item_id,
        price,
        currency,
        captured_at,
        method,
        evidence_json,
        raw_json
      )
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb, '{}'::jsonb)
      `,
      [
        tenantId,
        competitorItemId,
        snapshot.price,
        snapshot.currency,
        snapshot.capturedAt,
        snapshot.method,
        JSON.stringify(snapshot.evidence),
      ],
    );
  }
};

const seedRuleDefinitions = async (
  client: PoolClient,
  tenantId: string,
  rules: RuleDefinitionSeedInput[],
): Promise<void> => {
  for (const rule of rules) {
    await client.query(
      `
      INSERT INTO rule_definitions (
        tenant_id,
        code,
        name,
        description,
        severity,
        enabled,
        config_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        severity = EXCLUDED.severity,
        enabled = EXCLUDED.enabled,
        config_json = EXCLUDED.config_json,
        updated_at = now()
      `,
      [
        tenantId,
        rule.code,
        rule.name,
        rule.description,
        rule.severity,
        rule.enabled,
        JSON.stringify(rule.config),
      ],
    );
  }
};

const seedRulesEngineRules = async (
  client: PoolClient,
  tenantId: string,
  rules: RulesEngineRuleSeedInput[],
): Promise<void> => {
  for (const rule of rules) {
    await client.query(
      `
      INSERT INTO rules (
        tenant_id,
        rule_code,
        name,
        enabled,
        config_json
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (tenant_id, rule_code) DO UPDATE SET
        name = EXCLUDED.name,
        enabled = EXCLUDED.enabled,
        config_json = EXCLUDED.config_json,
        updated_at = now()
      `,
      [tenantId, rule.ruleCode, rule.name, rule.enabled, JSON.stringify(rule.config)],
    );
  }
};

const seedTenant = async (
  client: PoolClient,
  passwordHash: string,
  input: TenantSeedInput,
): Promise<string> => {
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const salesUserId = randomUUID();
  const opsUserId = randomUUID();
  const viewerUserId = randomUUID();
  const ownerRoleId = randomUUID();
  const salesRoleId = randomUUID();
  const opsRoleId = randomUUID();
  const viewerRoleId = randomUUID();

  await client.query(
    `
    INSERT INTO tenants (id, name, slug, status)
    VALUES ($1, $2, $3, 'active')
    ON CONFLICT (slug) DO NOTHING
    `,
    [tenantId, input.name, input.slug],
  );

  const tenantResult = await client.query<{ id: string }>(
    'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
    [input.slug],
  );

  const resolvedTenantId = tenantResult.rows[0]?.id;
  if (!resolvedTenantId) {
    throw new Error(`Failed to resolve tenant id for slug: ${input.slug}`);
  }

  await client.query(
    `
    INSERT INTO tenant_branding (
      tenant_id,
      logo_url,
      primary_color,
      secondary_color,
      email_from,
      domain_custom
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tenant_id) DO UPDATE SET
      logo_url = EXCLUDED.logo_url,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      email_from = EXCLUDED.email_from,
      domain_custom = EXCLUDED.domain_custom,
      updated_at = now()
    `,
    [
      resolvedTenantId,
      `https://cdn.pharos.local/${input.slug}-logo.png`,
      input.primaryColor,
      input.secondaryColor,
      `noreply@${input.slug}.test`,
      `${input.slug}.pharos.app`,
    ],
  );

  await client.query(
    `
    INSERT INTO tenant_settings (tenant_id, demo_mode)
    VALUES ($1, false)
    ON CONFLICT (tenant_id) DO UPDATE SET
      demo_mode = EXCLUDED.demo_mode,
      updated_at = now()
    `,
    [resolvedTenantId],
  );

  await client.query(
    `
    INSERT INTO tenant_feature_flags (tenant_id, flags_json, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      flags_json = EXCLUDED.flags_json,
      updated_at = now()
    `,
    [
      resolvedTenantId,
      JSON.stringify({
        competitor_engine: true,
        imports: true,
        connectors: true,
        notifications: false,
      }),
    ],
  );

  const roleValues: Array<[string, string]> = [
    [ownerRoleId, 'Owner'],
    [salesRoleId, 'Sales'],
    [opsRoleId, 'Ops'],
    [viewerRoleId, 'Viewer'],
  ];

  for (const [roleId, roleName] of roleValues) {
    await client.query(
      `
      INSERT INTO roles (id, tenant_id, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, name) DO NOTHING
      `,
      [roleId, resolvedTenantId, roleName],
    );
  }

  await client.query(
    `
    INSERT INTO users (id, tenant_id, name, email, password_hash, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    ON CONFLICT (tenant_id, email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      status = EXCLUDED.status
    `,
    [ownerId, resolvedTenantId, `${input.name} Owner`, input.ownerEmail, passwordHash],
  );

  await client.query(
    `
    INSERT INTO users (id, tenant_id, name, email, password_hash, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    ON CONFLICT (tenant_id, email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      status = EXCLUDED.status
    `,
    [salesUserId, resolvedTenantId, `${input.name} Sales`, input.salesEmail, passwordHash],
  );

  await client.query(
    `
    INSERT INTO users (id, tenant_id, name, email, password_hash, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    ON CONFLICT (tenant_id, email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      status = EXCLUDED.status
    `,
    [opsUserId, resolvedTenantId, `${input.name} Ops`, input.opsEmail, passwordHash],
  );

  await client.query(
    `
    INSERT INTO users (id, tenant_id, name, email, password_hash, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    ON CONFLICT (tenant_id, email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      status = EXCLUDED.status
    `,
    [viewerUserId, resolvedTenantId, `${input.name} Viewer`, input.viewerEmail, passwordHash],
  );

  const ownerUserResult = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1',
    [resolvedTenantId, input.ownerEmail],
  );

  const salesUserResult = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1',
    [resolvedTenantId, input.salesEmail],
  );

  const opsUserResult = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1',
    [resolvedTenantId, input.opsEmail],
  );

  const viewerUserResult = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1',
    [resolvedTenantId, input.viewerEmail],
  );

  const ownerRoleResult = await client.query<{ id: string }>(
    'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1',
    [resolvedTenantId, 'Owner'],
  );

  const salesRoleResult = await client.query<{ id: string }>(
    'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1',
    [resolvedTenantId, 'Sales'],
  );

  const opsRoleResult = await client.query<{ id: string }>(
    'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1',
    [resolvedTenantId, 'Ops'],
  );

  const viewerRoleResult = await client.query<{ id: string }>(
    'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1',
    [resolvedTenantId, 'Viewer'],
  );

  const resolvedOwnerId = ownerUserResult.rows[0]?.id;
  const resolvedSalesUserId = salesUserResult.rows[0]?.id;
  const resolvedOpsUserId = opsUserResult.rows[0]?.id;
  const resolvedViewerUserId = viewerUserResult.rows[0]?.id;
  const resolvedOwnerRoleId = ownerRoleResult.rows[0]?.id;
  const resolvedSalesRoleId = salesRoleResult.rows[0]?.id;
  const resolvedOpsRoleId = opsRoleResult.rows[0]?.id;
  const resolvedViewerRoleId = viewerRoleResult.rows[0]?.id;

  if (
    !resolvedOwnerId ||
    !resolvedSalesUserId ||
    !resolvedOpsUserId ||
    !resolvedViewerUserId ||
    !resolvedOwnerRoleId ||
    !resolvedSalesRoleId ||
    !resolvedOpsRoleId ||
    !resolvedViewerRoleId
  ) {
    throw new Error(`Failed to resolve seeded ids for slug: ${input.slug}`);
  }

  await client.query(
    `
    INSERT INTO user_roles (user_id, role_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [resolvedOwnerId, resolvedOwnerRoleId],
  );

  await client.query(
    `
    INSERT INTO user_roles (user_id, role_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [resolvedSalesUserId, resolvedSalesRoleId],
  );

  await client.query(
    `
    INSERT INTO user_roles (user_id, role_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [resolvedOpsUserId, resolvedOpsRoleId],
  );

  await client.query(
    `
    INSERT INTO user_roles (user_id, role_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [resolvedViewerUserId, resolvedViewerRoleId],
  );

  return resolvedTenantId;
};

const seed = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const seedUserPassword = process.env.SEED_USER_PASSWORD?.trim();
  const resolvedSeedPassword =
    seedUserPassword && seedUserPassword.length >= 8
      ? seedUserPassword
      : `dev-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const passwordHash = await bcrypt.hash(resolvedSeedPassword, 10);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const shaktiTenantId = await seedTenant(client, passwordHash, {
      name: 'Shakti Distributors',
      slug: 'shakti',
      ownerEmail: 'owner@shakti.test',
      salesEmail: 'sales@shakti.test',
      opsEmail: 'ops@shakti.test',
      viewerEmail: 'viewer@shakti.test',
      primaryColor: '#0F766E',
      secondaryColor: '#1E293B',
    });

    await seedSkuSet(client, shaktiTenantId, SHAKTI_SKUS);
    await seedCompetitorsAndSnapshots(
      client,
      shaktiTenantId,
      SHAKTI_COMPETITOR,
      SHAKTI_COMPETITOR_ITEMS,
      SHAKTI_COMPETITOR_SNAPSHOTS,
    );
    await seedRuleDefinitions(client, shaktiTenantId, V1_RULE_DEFINITIONS);
    await seedRulesEngineRules(client, shaktiTenantId, V1_ENGINE_RULES);
    await seedWarehouseInventory(client, shaktiTenantId, SHAKTI_WAREHOUSE);
    await seedDealersAndSales(client, shaktiTenantId, SHAKTI_DEALERS, SHAKTI_DEALER_SALES);

    const vikramTenantId = await seedTenant(client, passwordHash, {
      name: 'Vikram Pharma',
      slug: 'vikram',
      ownerEmail: 'owner@vikram.test',
      salesEmail: 'sales@vikram.test',
      opsEmail: 'ops@vikram.test',
      viewerEmail: 'viewer@vikram.test',
      primaryColor: '#0C4A6E',
      secondaryColor: '#334155',
    });
    await seedRuleDefinitions(client, vikramTenantId, V1_RULE_DEFINITIONS);
    await seedRulesEngineRules(client, vikramTenantId, V1_ENGINE_RULES);

    await client.query('COMMIT');
    console.log('Seed complete');
    console.log(`Seed credentials password (dev only): ${resolvedSeedPassword}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch((error: unknown) => {
  console.error('Seed failed', error);
  process.exit(1);
});
