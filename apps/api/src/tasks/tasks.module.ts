import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [CoreModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}

