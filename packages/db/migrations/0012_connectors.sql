ALTER TABLE integration_accounts
  DROP CONSTRAINT IF EXISTS integration_accounts_provider_check;

ALTER TABLE integration_accounts
  ADD CONSTRAINT integration_accounts_provider_check
  CHECK (provider IN ('shopify', 'woocommerce', 'generic_rest'));

ALTER TABLE webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check;

ALTER TABLE webhook_events
  ADD CONSTRAINT webhook_events_provider_check
  CHECK (provider IN ('shopify', 'woocommerce', 'generic_rest'));

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('shopify', 'woocommerce', 'generic_rest')),
  resource text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text
);

CREATE TABLE IF NOT EXISTS sync_state (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  resource text NOT NULL,
  cursor_type text NOT NULL,
  cursor_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider, resource)
);

CREATE TABLE IF NOT EXISTS external_id_map (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  resource text NOT NULL,
  external_id text NOT NULL,
  internal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider, resource, external_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant_started_at
  ON sync_runs(tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant_provider_resource
  ON sync_runs(tenant_id, provider, resource);
