import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from './authenticated.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller()
export class ProofController {
  @Get('admin/ping')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles('Owner')
  adminPing(): { status: string; scope: string } {
    return { status: 'ok', scope: 'admin' };
  }

  @Get('viewer/ping')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  viewerPing(): { status: string; scope: string } {
    return { status: 'ok', scope: 'viewer' };
  }
}
