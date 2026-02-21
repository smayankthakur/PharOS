import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AppLoggerService } from '../logger/app-logger.service';

export type UsageField =
  | 'alerts_created'
  | 'tasks_created'
  | 'snapshots_created'
  | 'imports_created'
  | 'rule_runs';

@Injectable()
export class UsageService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(AppLoggerService)
    private readonly logger: AppLoggerService,
  ) {}

  async incrementUsage(tenantId: string, field: UsageField, amount = 1): Promise<void> {
    if (!tenantId || amount <= 0) {
      return;
    }

    try {
      await this.databaseService.query(
        `
        INSERT INTO tenant_usage_daily (tenant_id, day, ${field})
        VALUES ($1, CURRENT_DATE, $2)
        ON CONFLICT (tenant_id, day) DO UPDATE SET
          ${field} = tenant_usage_daily.${field} + EXCLUDED.${field}
        `,
        [tenantId, amount],
      );
    } catch (error) {
      this.logger.warn('usage.increment.failed', {
        tenantId,
        field,
        amount,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }
}
