import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsQueueService } from './integrations.queue.service';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [CoreModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationsQueueService],
})
export class IntegrationsModule {}

