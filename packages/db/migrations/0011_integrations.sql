CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('dealer_sales', 'inventory_movements', 'competitor_snapshots')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'success', 'partial', 'failed')),
  file_name text,
  file_hash text,
  idempotency_key text NOT NULL,
  total_rows int NOT NULL DEFAULT 0,
  success_rows int NOT NULL DEFAULT 0,
  error_rows int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  error_text text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_rows_job
  ON import_rows(import_job_id);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_created
  ON import_jobs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('shopify', 'woocommerce')),
  status text NOT NULL DEFAULT 'active',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('shopify', 'woocommerce')),
  event_type text NOT NULL,
  external_id text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_text text,
  UNIQUE (tenant_id, provider, external_id)
);
