import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TenantDb } from '../database/tenant-db.service';
import { FEATURE_FLAG_KEY } from './feature-flags.decorator';

type FeatureFlagsRow = {
  tenant_id: string;
  flags_json: Record<string, unknown>;
  updated_at: Date;
};

const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  competitor_engine: true,
  imports: true,
  connectors: false,
  notifications: false,
};

@Injectable()
export class FeatureFlagsGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureFlag = this.reflector.getAllAndOverride<string | undefined>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!featureFlag) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const row = await this.tenantDb.selectOne<FeatureFlagsRow>(
      tenantId,
      'tenant_feature_flags',
      {},
      ['tenant_id', 'flags_json', 'updated_at'],
    );

    const mergedFlags: Record<string, boolean> = { ...DEFAULT_FEATURE_FLAGS };
    if (row?.flags_json) {
      for (const [key, value] of Object.entries(row.flags_json)) {
        if (typeof value === 'boolean') {
          mergedFlags[key] = value;
        }
      }
    }

    if (!mergedFlags[featureFlag]) {
      throw new ForbiddenException(`Feature "${featureFlag}" is disabled for this tenant`);
    }

    return true;
  }
}

export const getDefaultFeatureFlags = (): Record<string, boolean> => ({ ...DEFAULT_FEATURE_FLAGS });
