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
  'competitor.created',
  'competitor.item.mapped',
  'competitor.snapshot.recorded',
  'rule.run.started',
  'rule.run.completed',
  'alert.created',
  'task.created',
  'task.assigned',
  'task.status.changed',
  'task.resolved',
  'task.closed',
  'task.commented',
  'rule.definition.created',
  'rule.definition.updated',
] as const;

export type EventName = (typeof EVENT_REGISTRY)[number];

export const EVENT_SET = new Set<string>(EVENT_REGISTRY);
