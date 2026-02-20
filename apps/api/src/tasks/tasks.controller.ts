import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type AssignTaskInput,
  type CreateCommentInput,
  type TaskDetailResponse,
  type TaskListQuery,
  type TaskResponse,
  type UpdateTaskStatusInput,
  TasksService,
} from './tasks.service';

@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard)
export class TasksController {
  constructor(
    @Inject(TasksService)
    private readonly tasksService: TasksService,
  ) {}

  @Post('tasks/from-alert/:alertId')
  @Roles('Owner', 'Ops', 'Sales')
  async fromAlert(@Req() req: Request, @Param('alertId') alertId: string): Promise<TaskResponse> {
    const tenantId = req.tenantId;
    const user = req.user;
    const userRoles = req.userRoles ?? [];
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tasksService.createFromAlert(tenantId, user.userId, userRoles, alertId);
  }

  @Get('tasks')
  @Roles('Owner', 'Ops', 'Sales', 'Viewer')
  async list(@Req() req: Request, @Query() query: TaskListQuery): Promise<{ items: TaskResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.tasksService.listTasks(tenantId, query) };
  }

  @Get('tasks/:id')
  @Roles('Owner', 'Ops', 'Sales', 'Viewer')
  async byId(@Req() req: Request, @Param('id') id: string): Promise<TaskDetailResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tasksService.getTaskById(tenantId, id);
  }

  @Patch('tasks/:id/assign')
  @Roles('Owner', 'Ops')
  async assign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AssignTaskInput,
  ): Promise<TaskResponse> {
    const tenantId = req.tenantId;
    const user = req.user;
    const userRoles = req.userRoles ?? [];
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tasksService.assignTask(tenantId, user.userId, userRoles, id, body);
  }

  @Patch('tasks/:id/status')
  @Roles('Owner', 'Ops', 'Sales')
  async patchStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateTaskStatusInput,
  ): Promise<TaskResponse> {
    const tenantId = req.tenantId;
    const user = req.user;
    const userRoles = req.userRoles ?? [];
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tasksService.updateStatus(tenantId, user.userId, userRoles, id, body);
  }

  @Post('tasks/:id/comments')
  @Roles('Owner', 'Ops', 'Sales')
  async comment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateCommentInput,
  ): Promise<{ id: string }> {
    const tenantId = req.tenantId;
    const user = req.user;
    const userRoles = req.userRoles ?? [];
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tasksService.addComment(tenantId, user.userId, userRoles, id, body);
  }
}

