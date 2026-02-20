import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { DealerController } from './dealer.controller';
import { DealerService } from './dealer.service';

@Module({
  imports: [CoreModule],
  controllers: [DealerController],
  providers: [DealerService],
})
export class DealerModule {}
