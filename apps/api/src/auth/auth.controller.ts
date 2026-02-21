import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { AuthService } from './auth.service';
import type { Request } from 'express';

type LoginBody = {
  email?: string;
  password?: string;
};

type CreateUserBody = {
  name?: string;
  email?: string;
  password?: string;
  roles?: Array<'Owner' | 'Sales' | 'Ops' | 'Viewer'>;
};

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Post('auth/login')
  async login(@Body() body: LoginBody): Promise<{ accessToken: string }> {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new BadRequestException('Email and password are required');
    }

    return this.authService.login(body.email, body.password);
  }

  @Post('auth/users')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles('Owner')
  async createUser(
    @Req() req: Request,
    @Body() body: CreateUserBody,
  ): Promise<{ id: string; tenantId: string; name: string; email: string; roles: string[] }> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.authService.createUser(tenantId, user.userId, {
      name: body.name ?? '',
      email: body.email ?? '',
      password: body.password ?? '',
      roles: Array.isArray(body.roles) ? body.roles : [],
    });
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  async me(
    @Req() req: Request,
  ): Promise<{ id: string; tenantId: string | null; name: string; email: string; roles: string[] }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.authService.getMe(user.userId, user.tenantId);
  }
}
