CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity text NOT NULL CHECK (severity IN ('medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'closed')),
  assigned_role text NOT NULL CHECK (assigned_role IN ('Sales', 'Ops')),
  assignee_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  sla_hours integer NOT NULL CHECK (sla_hours > 0),
  due_at timestamptz NOT NULL,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_code text CHECK (
    resolution_code IN (
      'price_adjusted',
      'dealer_warned',
      'promo_launched',
      'stock_transfer',
      'bundle_created',
      'no_action'
    )
  ),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, alert_id)
);

CREATE TABLE IF NOT EXISTS task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'assigned', 'status_changed', 'commented', 'resolved', 'closed')),
  from_status text,
  to_status text,
  from_assignee uuid,
  to_assignee uuid,
  from_role text,
  to_role text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due_at ON tasks (tenant_id, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assigned_role ON tasks (tenant_id, assigned_role);
CREATE INDEX IF NOT EXISTS idx_task_history_task_created ON task_history (task_id, created_at);
