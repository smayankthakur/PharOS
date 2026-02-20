CREATE TABLE IF NOT EXISTS skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS sku_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  cost numeric(12, 2) NOT NULL CHECK (cost >= 0),
  map numeric(12, 2) NOT NULL CHECK (map >= 0),
  mrp numeric(12, 2) NOT NULL CHECK (mrp >= 0),
  active_price numeric(12, 2) NOT NULL CHECK (active_price >= 0),
  currency_code text NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku_id)
);

CREATE INDEX IF NOT EXISTS idx_skus_tenant_id ON skus(tenant_id);
CREATE INDEX IF NOT EXISTS idx_skus_tenant_code ON skus(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_sku_pricing_tenant_id ON sku_pricing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sku_pricing_tenant_sku ON sku_pricing(tenant_id, sku_id);
