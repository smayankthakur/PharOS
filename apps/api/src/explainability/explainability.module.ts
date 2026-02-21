import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ExplainabilityController } from './explainability.controller';
import { ExplainabilityService } from './explainability.service';

@Module({
  imports: [CoreModule],
  controllers: [ExplainabilityController],
  providers: [ExplainabilityService],
})
export class ExplainabilityModule {}

