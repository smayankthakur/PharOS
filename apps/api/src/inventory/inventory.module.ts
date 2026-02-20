import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [CoreModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
