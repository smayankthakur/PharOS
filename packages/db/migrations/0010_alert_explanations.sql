ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE alerts
SET updated_at = COALESCE(detected_at, created_at, now())
WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS alert_explanations (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  narrative_text text NOT NULL,
  timeline_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  math_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generator_version text NOT NULL DEFAULT 'v1',
  PRIMARY KEY (tenant_id, alert_id)
);
