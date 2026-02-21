import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [CoreModule, InventoryModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}

