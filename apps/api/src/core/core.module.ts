import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { AppLoggerService } from '../logger/app-logger.service';
import { RequestContextService } from '../logger/request-context.service';
import { RedisService } from '../redis/redis.service';

@Module({
  providers: [
    DatabaseService,
    RedisService,
    RequestContextService,
    AppLoggerService,
    TenantDb,
    AuditService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [
    DatabaseService,
    RedisService,
    RequestContextService,
    AppLoggerService,
    TenantDb,
    AuditService,
  ],
})
export class CoreModule {}
