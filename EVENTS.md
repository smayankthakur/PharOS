# Events Registry

This registry lists all audit events currently allowed by the API.
Unknown events are rejected by `AuditService.record()` and logged as warnings.

## auth.login
- Producer: `POST /auth/login`
- Required payload fields:
  - `email` (string)

## tenant.view
- Producer: `GET /tenants/current`
- Required payload fields:
  - `slug` (string)

## tenant.lookup
- Producer: `GET /tenants/by-slug/:slug`
- Required payload fields:
  - `slug` (string)

## rbac.denied
- Producer: RBAC guard on protected endpoints
- Required payload fields:
  - `requiredRoles` (string[])

## tenant.settings.view
- Producer: `GET /tenants/current/settings`
- Required payload fields:
  - `demo_mode` (boolean)

## tenant.settings.update
- Producer: `PATCH /tenants/current/settings`
- Required payload fields:
  - `demo_mode` (boolean)

## security.ratelimit
- Producer: rate-limit middleware when request is throttled (if tenant context exists)
- Required payload fields:
  - `ip` (string)
  - `route` (string)
  - `retry_after_sec` (number)

## sku.created
- Producer: `POST /skus`
- Required payload fields:
  - `code` (string)
  - `name` (string)

## sku.pricing.updated
- Producer: `PATCH /skus/:id/pricing`
- Required payload fields:
  - `cost` (number)
  - `map` (number)
  - `mrp` (number)
  - `active_price` (number)

## warehouse.created
- Producer: `POST /warehouses`
- Required payload fields:
  - `warehouse_id` (uuid string)
  - `name` (string)

## inventory.movement.created
- Producer: `POST /inventory/movements`
- Required payload fields:
  - `sku_id` (uuid string)
  - `warehouse_id` (uuid string)
  - `type` ('in' | 'out' | 'adjust')
  - `qty` (number)
  - `ref_type` (string | null)
  - `ref_id` (string | null)

## dealer.created
- Producer: `POST /dealers`
- Required payload fields:
  - `dealer_id` (uuid string)
  - `name` (string)

## dealer.sale.recorded
- Producer: `POST /dealer-sales`
- Required payload fields:
  - `dealer_id` (uuid string)
  - `sku_id` (uuid string)
  - `sale_price` (number)
  - `qty` (number)
  - `sale_date` (date string)
  - `source` ('manual' | 'csv' | 'shopify' | 'woocommerce' | 'rest')
  - `ref_no` (string | null)

## competitor.created
- Producer: `POST /competitors`
- Required payload fields:
  - `competitor_id` (uuid string)
  - `name` (string)
  - `website` (string | null)

## competitor.item.mapped
- Producer: `POST /competitor-items`
- Required payload fields:
  - `competitor_item_id` (uuid string)
  - `competitor_id` (uuid string)
  - `sku_id` (uuid string)
  - `product_url` (string)

## competitor.snapshot.recorded
- Producer: `POST /competitor-snapshots`
- Required payload fields:
  - `competitor_snapshot_id` (uuid string)
  - `competitor_item_id` (uuid string)
  - `sku_id` (uuid string)
  - `competitor_id` (uuid string)
  - `product_url` (string)
  - `price` (number)

## rule.definition.created
- Producer: `POST /rule-definitions`
- Required payload fields:
  - `rule_definition_id` (uuid string)
  - `code` ('R1' | 'R2' | 'R3' | 'R4')
  - `severity` ('critical' | 'high' | 'medium' | 'low')

## rule.definition.updated
- Producer: `PATCH /rule-definitions/:id`
- Required payload fields:
  - `rule_definition_id` (uuid string)
  - `code` ('R1' | 'R2' | 'R3' | 'R4')
  - `severity` ('critical' | 'high' | 'medium' | 'low')
  - `enabled` (boolean)

## rule.run.started
- Producer: `POST /rules/run`
- Required payload fields:
  - `run_id` (uuid string)

## rule.run.completed
- Producer: `POST /rules/run`
- Required payload fields:
  - `run_id` (uuid string)
  - `status` ('success' | 'failed')

## alert.created
- Producer: Rules engine while writing alerts
- Required payload fields:
  - `rule_code` ('R1' | 'R2' | 'R3' | 'R4')
  - `severity` ('medium' | 'high' | 'critical')
  - `impact_value` (number)
  - `fingerprint` (string)

## task.created
- Producer: `POST /tasks/from-alert/:alertId`
- Required payload fields:
  - `task_id` (uuid string)
  - `alert_id` (uuid string)
  - `assigned_role` ('Sales' | 'Ops')
  - `sla_hours` (number)

## task.assigned
- Producer: `PATCH /tasks/:id/assign`
- Required payload fields:
  - `task_id` (uuid string)
  - `from_role` ('Sales' | 'Ops')
  - `to_role` ('Sales' | 'Ops')

## task.status.changed
- Producer: `PATCH /tasks/:id/status`
- Required payload fields:
  - `task_id` (uuid string)
  - `from_status` (string)
  - `to_status` (string)

## task.resolved
- Producer: `PATCH /tasks/:id/status` when status is `resolved`
- Required payload fields:
  - `task_id` (uuid string)
  - `from_status` (string)
  - `to_status` ('resolved')
  - `resolution_code` (string)

## task.closed
- Producer: `PATCH /tasks/:id/status` when status is `closed`
- Required payload fields:
  - `task_id` (uuid string)
  - `from_status` ('resolved')
  - `to_status` ('closed')

## task.commented
- Producer: `POST /tasks/:id/comments`
- Required payload fields:
  - `task_id` (uuid string)
  - `comment_id` (uuid string)
