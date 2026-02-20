import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type CreateRuleDefinitionInput,
  type PatchRuleDefinitionInput,
  type RuleDefinitionResponse,
  RuleDefinitionsService,
} from './rule-definitions.service';

@Controller('rule-definitions')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class RuleDefinitionsController {
  constructor(private readonly ruleDefinitionsService: RuleDefinitionsService) {}

  @Post()
  @Roles('Owner', 'Ops')
  async create(
    @Req() req: Request,
    @Body() body: CreateRuleDefinitionInput,
  ): Promise<RuleDefinitionResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.ruleDefinitionsService.create(tenantId, user.userId, body);
  }

  @Get()
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async list(@Req() req: Request): Promise<{ items: RuleDefinitionResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.ruleDefinitionsService.list(tenantId) };
  }

  @Get(':id')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async getById(@Req() req: Request, @Param('id') id: string): Promise<RuleDefinitionResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.ruleDefinitionsService.getById(tenantId, id);
  }

  @Patch(':id')
  @Roles('Owner', 'Ops')
  async patch(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: PatchRuleDefinitionInput,
  ): Promise<RuleDefinitionResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.ruleDefinitionsService.patch(tenantId, user.userId, id, body);
  }
}
