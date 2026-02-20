import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RuleDefinitionsController } from './rule-definitions.controller';
import { RuleDefinitionsService } from './rule-definitions.service';

@Module({
  imports: [CoreModule],
  controllers: [RuleDefinitionsController],
  providers: [RuleDefinitionsService],
})
export class RuleDefinitionsModule {}
