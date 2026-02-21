export type ConnectionState = 'connected' | 'disconnected' | 'in_memory';

export type HealthResponse = {
  status: 'ok';
  db: ConnectionState;
  redis: ConnectionState;
  timestamp: Date;
};

export const RULES = ['R1', 'R2', 'R3', 'R4'] as const;
export type RuleCode = (typeof RULES)[number];

export const IMPACT_TYPES = ['loss', 'risk', 'dead_value'] as const;
export type ImpactType = (typeof IMPACT_TYPES)[number];

export const SEVERITY = ['medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITY)[number];

