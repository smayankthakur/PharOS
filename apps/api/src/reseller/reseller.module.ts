import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ResellerController } from './reseller.controller';
import { ResellerService } from './reseller.service';

@Module({
  imports: [CoreModule],
  controllers: [ResellerController],
  providers: [ResellerService],
  exports: [ResellerService],
})
export class ResellerModule {}
