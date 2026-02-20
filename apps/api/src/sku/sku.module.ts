import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { SkuController } from './sku.controller';
import { SkuService } from './sku.service';

@Module({
  imports: [CoreModule],
  controllers: [SkuController],
  providers: [SkuService],
})
export class SkuModule {}
