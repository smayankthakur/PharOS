ALTER TABLE users
ALTER COLUMN tenant_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reseller_users (
  reseller_id uuid NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'reseller_admin',
  PRIMARY KEY (reseller_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_provisioning (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  reseller_id uuid NULL REFERENCES resellers(id) ON DELETE SET NULL,
  provisioned_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  plan text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  flags_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenant_feature_flags (tenant_id, flags_json, updated_at)
SELECT
  t.id,
  '{"competitor_engine": true, "imports": true, "connectors": false, "notifications": false}'::jsonb,
  now()
FROM tenants t
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_usage_daily (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  alerts_created int NOT NULL DEFAULT 0,
  tasks_created int NOT NULL DEFAULT 0,
  snapshots_created int NOT NULL DEFAULT 0,
  imports_created int NOT NULL DEFAULT 0,
  rule_runs int NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);

CREATE INDEX IF NOT EXISTS idx_tenant_provisioning_reseller_created
  ON tenant_provisioning(reseller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_daily_tenant_day
  ON tenant_usage_daily(tenant_id, day DESC);
