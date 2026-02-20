CREATE TABLE IF NOT EXISTS dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  region text,
  contact_name text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS dealer_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  sale_price numeric(12, 2) NOT NULL,
  qty integer NOT NULL,
  sale_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  ref_no text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealer_sales_tenant_sale_date
  ON dealer_sales(tenant_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_dealer_sales_tenant_sku
  ON dealer_sales(tenant_id, sku_id);

CREATE INDEX IF NOT EXISTS idx_dealer_sales_tenant_dealer
  ON dealer_sales(tenant_id, dealer_id);
