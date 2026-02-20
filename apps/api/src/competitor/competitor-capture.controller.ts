import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { CompetitorQueueService } from './competitor-queue.service';

const enqueueCaptureSchema = z.object({
  competitor_item_id: z.string().uuid(),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).optional(),
  captured_at: z.string().datetime().optional(),
  evidence_json: z.record(z.string(), z.unknown()).optional(),
  raw_json: z.record(z.string(), z.unknown()).optional(),
});

type EnqueueCaptureInput = z.input<typeof enqueueCaptureSchema>;

@Controller('competitor-capture')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class CompetitorCaptureController {
  constructor(private readonly competitorQueueService: CompetitorQueueService) {}

  @Post('enqueue')
  @Roles('Owner', 'Ops')
  async enqueue(
    @Req() req: Request,
    @Body() body: EnqueueCaptureInput,
  ): Promise<{ enqueued: true; jobId: string }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    const parsed = enqueueCaptureSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const jobId = await this.competitorQueueService.enqueueCapture({
      tenant_id: tenantId,
      competitor_item_id: parsed.data.competitor_item_id,
      price: parsed.data.price,
      currency: parsed.data.currency,
      captured_at: parsed.data.captured_at,
      evidence_json: parsed.data.evidence_json,
      raw_json: parsed.data.raw_json,
    });

    return { enqueued: true, jobId };
  }
}
