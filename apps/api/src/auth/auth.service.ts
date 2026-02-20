import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loadConfig } from '@pharos/config';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import type { AuthenticatedUser, JwtClaims } from './auth.types';

type UserRow = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  password_hash: string;
  status: string;
};

type RoleRow = {
  name: string;
};

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {
    const config = loadConfig();
    this.jwtSecret = config.jwtSecret;
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const userResult = await this.databaseService.query<UserRow>(
      `
      SELECT id, tenant_id, name, email, password_hash, status
      FROM users
      WHERE lower(email) = $1
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [normalizedEmail],
    );

    const user = userResult.rows[0];
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const claims: JwtClaims = {
      sub: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
    };

    const accessToken = jwt.sign(claims, this.jwtSecret, {
      expiresIn: '12h',
    });

    await this.auditService.record({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      payload: { email: user.email },
    });

    return { accessToken };
  }

  verifyToken(token: string): AuthenticatedUser {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtClaims;
      return {
        userId: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        name: payload.name,
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async getMe(
    userId: string,
    tenantId: string,
  ): Promise<{ id: string; tenantId: string; name: string; email: string; roles: string[] }> {
    const user = await this.tenantDb.selectOne<Pick<UserRow, 'id' | 'tenant_id' | 'name' | 'email'>>(
      tenantId,
      'users',
      { id: userId },
      ['id', 'tenant_id', 'name', 'email'],
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roleResult = await this.databaseService.query<RoleRow>(
      `
      SELECT r.name
      FROM roles r
      INNER JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND r.tenant_id = $2
      ORDER BY r.name ASC
      `,
      [userId, tenantId],
    );

    return {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      roles: roleResult.rows.map((role) => role.name),
    };
  }
}
