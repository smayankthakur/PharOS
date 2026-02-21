import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuditController } from './audit/audit.controller';
import { AuthModule } from './auth/auth.module';
import { TenantContextMiddleware } from './auth/tenant-context.middleware';
import { CoreModule } from './core/core.module';
import { CompetitorModule } from './competitor/competitor.module';
import { DealerSalesModule } from './dealer-sales/dealer-sales.module';
import { DealerModule } from './dealer/dealer.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExplainabilityModule } from './explainability/explainability.module';
import { HealthController } from './health/health.controller';
import { RequestContextMiddleware } from './logger/request-context.middleware';
import { AuthenticatedGuard } from './rbac/authenticated.guard';
import { ProofController } from './rbac/proof.controller';
import { RolesGuard } from './rbac/roles.guard';
import { RuleDefinitionsModule } from './rule-definitions/rule-definitions.module';
import { RulesEngineModule } from './rules-engine/rules-engine.module';
import { RateLimitMiddleware } from './security/rate-limit.middleware';
import { InventoryModule } from './inventory/inventory.module';
import { SkuModule } from './sku/sku.module';
import { TenantsModule } from './tenants/tenants.module';
import { TasksModule } from './tasks/tasks.module';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    TenantsModule,
    SkuModule,
    WarehouseModule,
    InventoryModule,
    CompetitorModule,
    RulesEngineModule,
    RuleDefinitionsModule,
    TasksModule,
    DealerModule,
    DealerSalesModule,
    DashboardModule,
    ExplainabilityModule,
  ],
  controllers: [HealthController, ProofController, AuditController],
  providers: [
    RequestContextMiddleware,
    TenantContextMiddleware,
    RateLimitMiddleware,
    AuthenticatedGuard,
    RolesGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');

    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
        { path: 'tenants/by-slug/:slug', method: RequestMethod.GET },
      )
      .forRoutes('*');

    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
