import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { DealerSalesController } from './dealer-sales.controller';
import { DealerSalesService } from './dealer-sales.service';

@Module({
  imports: [CoreModule],
  controllers: [DealerSalesController],
  providers: [DealerSalesService],
})
export class DealerSalesModule {}
