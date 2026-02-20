import type { AuthenticatedUser } from '../auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantId?: string;
      userRoles?: string[];
      requestId?: string;
    }
  }
}

export {};
