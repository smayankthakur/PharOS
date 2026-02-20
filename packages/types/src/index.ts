export type ConnectionState = 'connected' | 'disconnected';

export type HealthResponse = {
  status: 'ok';
  db: ConnectionState;
  redis: ConnectionState;
  timestamp: Date;
};

