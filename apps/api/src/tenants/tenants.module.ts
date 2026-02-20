import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [CoreModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
