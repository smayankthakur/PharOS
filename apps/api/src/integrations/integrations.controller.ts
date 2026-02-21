import {
  Body,
  Controller,
  Headers,
  Inject,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { RequireFeature } from '../security/feature-flags.decorator';
import { FeatureFlagsGuard } from '../security/feature-flags.guard';
import {
  type ConnectorSyncInput,
  type SaveIntegrationConfigInput,
  IntegrationsService,
} from './integrations.service';

@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard, FeatureFlagsGuard)
@RequireFeature('connectors')
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService)
    private readonly integrationsService: IntegrationsService,
  ) {}

  @Post('integrations/:provider/config')
  @Roles('Owner', 'Ops')
  async saveConfig(
    @Req() req: Request,
    @Param('provider') providerParam: string,
    @Body() body: SaveIntegrationConfigInput,
  ): Promise<{ id: string; provider: 'shopify' | 'woocommerce' | 'generic_rest'; status: string; config_json: Record<string, unknown> }> {
    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    const provider = this.integrationsService.parseProvider(providerParam);
    return this.integrationsService.saveConfig(tenantId, user.userId, provider, body);
  }

  @Post('connectors/:provider/test')
  @Roles('Owner', 'Ops')
  async testConnector(
    @Req() req: Request,
    @Param('provider') providerParam: string,
  ): Promise<{ ok: boolean; provider: 'shopify' | 'woocommerce' | 'generic_rest'; sample: Record<string, unknown> }> {
    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const provider = this.integrationsService.parseProvider(providerParam);
    return this.integrationsService.testConnector(tenantId, user.userId, provider);
  }

  @Post('connectors/:provider/sync')
  @Roles('Owner', 'Ops')
  async syncConnector(
    @Req() req: Request,
    @Param('provider') providerParam: string,
    @Body() body: ConnectorSyncInput,
  ): Promise<{ enqueued: true; job_id: string }> {
    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const provider = this.integrationsService.parseProvider(providerParam);
    return this.integrationsService.enqueueSync(tenantId, user.userId, provider, body);
  }

  @Get('connectors/sync-runs')
  @Roles('Owner', 'Ops')
  async listSyncRuns(
    @Req() req: Request,
    @Query('provider') provider?: string,
    @Query('resource') resource?: string,
    @Query('status') status?: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }
    const filters: { provider?: string; resource?: string; status?: string } = {};
    if (provider) {
      filters.provider = provider;
    }
    if (resource) {
      filters.resource = resource;
    }
    if (status) {
      filters.status = status;
    }
    return this.integrationsService.listSyncRuns(tenantId, filters);
  }

  @Get('connectors/state')
  @Roles('Owner', 'Ops')
  async listSyncState(
    @Req() req: Request,
    @Query('provider') provider?: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }
    return this.integrationsService.listSyncState(tenantId, provider);
  }

  @Post('webhooks/:provider')
  @Roles('Owner', 'Ops')
  async receiveWebhook(
    @Req() req: Request,
    @Param('provider') providerParam: string,
    @Headers() headers: Record<string, string | undefined>,
    @Headers('external_id') externalIdHeader: string | undefined,
    @Headers('x-event-type') eventTypeHeader: string | undefined,
    @Body() payload: Record<string, unknown>,
  ): Promise<{ accepted: true; webhook_event_id: string }> {
    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    const provider = this.integrationsService.parseProvider(providerParam);
    const eventType =
      (typeof eventTypeHeader === 'string' && eventTypeHeader.trim().length > 0
        ? eventTypeHeader
        : typeof payload.event_type === 'string'
          ? payload.event_type
          : '') ?? '';

    return this.integrationsService.receiveWebhook(
      tenantId,
      user.userId,
      provider,
      eventType,
      externalIdHeader ?? null,
      payload,
      headers,
    );
  }

  @Post('webhooks/:provider/process-now')
  @Roles('Owner', 'Ops')
  async processNow(
    @Req() req: Request,
    @Param('provider') providerParam: string,
  ): Promise<{ enqueued: true; job_id: string }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }
    const provider = this.integrationsService.parseProvider(providerParam);
    return this.integrationsService.processNow(tenantId, provider);
  }
}
