CREATE TABLE IF NOT EXISTS rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_code)
);

CREATE TABLE IF NOT EXISTS rule_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  impact_value numeric(14, 2) NOT NULL DEFAULT 0,
  impact_type text NOT NULL,
  message text NOT NULL,
  sku_id uuid REFERENCES skus(id) ON DELETE CASCADE,
  dealer_id uuid REFERENCES dealers(id) ON DELETE SET NULL,
  competitor_item_id uuid REFERENCES competitor_items(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS alert_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  evidence_id uuid NOT NULL,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_detected
  ON alerts(tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_rule_status
  ON alerts(tenant_id, rule_code, status);

CREATE INDEX IF NOT EXISTS idx_alert_evidence_alert
  ON alert_evidence(alert_id);
