import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request } from 'express';

type LoginBody = {
  email?: string;
  password?: string;
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

  @Get('me')
  async me(
    @Req() req: Request,
  ): Promise<{ id: string; tenantId: string; name: string; email: string; roles: string[] }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.authService.getMe(user.userId, user.tenantId);
  }
}
