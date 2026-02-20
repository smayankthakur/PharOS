export const EVENT_REGISTRY = [
  'auth.login',
  'tenant.view',
  'tenant.lookup',
  'rbac.denied',
  'tenant.settings.view',
  'tenant.settings.update',
  'security.ratelimit',
  'sku.created',
  'sku.pricing.updated',
  'warehouse.created',
  'inventory.movement.created',
  'dealer.created',
  'dealer.sale.recorded',
] as const;

export type EventName = (typeof EVENT_REGISTRY)[number];

export const EVENT_SET = new Set<string>(EVENT_REGISTRY);
