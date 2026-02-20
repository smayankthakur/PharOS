import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RulesEngineController } from './rules-engine.controller';
import { RulesEngineService } from './rules-engine.service';

@Module({
  imports: [CoreModule],
  controllers: [RulesEngineController],
  providers: [RulesEngineService],
})
export class RulesEngineModule {}
