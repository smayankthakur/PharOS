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
