import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loadConfig } from '@pharos/config';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import type { AuthenticatedUser, JwtClaims } from './auth.types';

type UserRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  password_hash: string;
  status: string;
};

type RoleRow = {
  id: string;
  name: string;
};

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  roles: z.array(z.enum(['Owner', 'Sales', 'Ops', 'Viewer'])).min(1),
});

export type CreateUserInput = z.input<typeof createUserSchema>;

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

    if (user.tenant_id) {
      await this.auditService.record({
        tenantId: user.tenant_id,
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        payload: { email: user.email },
      });
    }

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
    tenantId: string | null,
  ): Promise<{ id: string; tenantId: string | null; name: string; email: string; roles: string[] }> {
    const userResult = await this.databaseService.query<Pick<UserRow, 'id' | 'tenant_id' | 'name' | 'email'>>(
      `
      SELECT id, tenant_id, name, email
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    const user = userResult.rows[0];

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!tenantId) {
      return {
        id: user.id,
        tenantId: null,
        name: user.name,
        email: user.email,
        roles: [],
      };
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
        tenantId,
        name: user.name,
        email: user.email,
        roles: roleResult.rows.map((role) => role.name),
      };
  }

  async createUser(
    tenantId: string,
    actorUserId: string,
    input: CreateUserInput,
  ): Promise<{ id: string; tenantId: string; name: string; email: string; roles: string[] }> {
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const roles = [...new Set(parsed.data.roles)];

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const createdUser = await this.databaseService.withTransaction(async (client) => {
      const existingUser = await client.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1 AND lower(email) = $2
        LIMIT 1
        `,
        [tenantId, normalizedEmail],
      );

      if (existingUser.rows[0]) {
        throw new BadRequestException('Email already exists in tenant');
      }

      const roleResult = await client.query<RoleRow>(
        `
        SELECT id, name
        FROM roles
        WHERE tenant_id = $1 AND name = ANY($2::text[])
        `,
        [tenantId, roles],
      );

      if (roleResult.rows.length !== roles.length) {
        throw new NotFoundException('One or more roles do not exist in tenant');
      }

      const userInsert = await client.query<Pick<UserRow, 'id' | 'tenant_id' | 'name' | 'email'>>(
        `
        INSERT INTO users (tenant_id, name, email, password_hash, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING id, tenant_id, name, email
        `,
        [tenantId, parsed.data.name, normalizedEmail, passwordHash],
      );

      const user = userInsert.rows[0];
      if (!user) {
        throw new BadRequestException('Unable to create user');
      }

      for (const role of roleResult.rows) {
        await client.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [user.id, role.id],
        );
      }

      return {
        id: user.id,
        tenantId,
        name: user.name,
        email: user.email,
        roles: roleResult.rows.map((row) => row.name).sort(),
      };
    });

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'auth.user.created',
      entityType: 'user',
      entityId: createdUser.id,
      payload: {
        email: createdUser.email,
        roles: createdUser.roles,
      },
    });

    return createdUser;
  }
}
