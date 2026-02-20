import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { CompetitorCaptureController } from './competitor-capture.controller';
import { CompetitorController } from './competitor.controller';
import { CompetitorQueueService } from './competitor-queue.service';
import { CompetitorService } from './competitor.service';

@Module({
  imports: [CoreModule],
  controllers: [CompetitorController, CompetitorCaptureController],
  providers: [CompetitorService, CompetitorQueueService],
})
export class CompetitorModule {}
