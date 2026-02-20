import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { ROLES_KEY } from './roles.decorator';

type RoleRow = {
  name: string;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const tenantId = request.tenantId;

    if (!user || !tenantId) {
      await this.logDenied(tenantId ?? null, user?.userId ?? null, requiredRoles);
      throw new ForbiddenException('Insufficient role access');
    }

    const userRoles = request.userRoles ?? (await this.getUserRoles(user.userId, tenantId));
    request.userRoles = userRoles;

    const allowed = requiredRoles.some((requiredRole) => userRoles.includes(requiredRole));

    if (!allowed) {
      await this.logDenied(tenantId, user.userId, requiredRoles);
      throw new ForbiddenException('Insufficient role access');
    }

    return true;
  }

  private async getUserRoles(userId: string, tenantId: string): Promise<string[]> {
    const result = await this.databaseService.query<RoleRow>(
      `
      SELECT r.name
      FROM roles r
      INNER JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND r.tenant_id = $2
      `,
      [userId, tenantId],
    );

    return result.rows.map((row) => row.name);
  }

  private async logDenied(
    tenantId: string | null,
    actorUserId: string | null,
    requiredRoles: string[],
  ): Promise<void> {
    if (!tenantId) {
      return;
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'rbac.denied',
      entityType: 'role',
      payload: { requiredRoles },
    });
  }
}
