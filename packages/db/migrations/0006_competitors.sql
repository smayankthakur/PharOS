CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS competitors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS competitor_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  product_url text NOT NULL,
  external_sku text,
  selector_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, competitor_id, sku_id)
);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competitor_item_id uuid NOT NULL REFERENCES competitor_items(id) ON DELETE CASCADE,
  price numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  captured_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'manual',
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_items_tenant_sku
  ON competitor_items(tenant_id, sku_id);

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_tenant_item_captured
  ON competitor_snapshots(tenant_id, competitor_item_id, captured_at DESC);
