import {
  BadRequestException,
  Body,
  Controller,
  Inject,
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
import { RequireFeature } from '../security/feature-flags.decorator';
import { FeatureFlagsGuard } from '../security/feature-flags.guard';
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
@UseGuards(AuthenticatedGuard, RolesGuard, FeatureFlagsGuard)
@RequireFeature('competitor_engine')
export class CompetitorCaptureController {
  constructor(
    @Inject(CompetitorQueueService)
    private readonly competitorQueueService: CompetitorQueueService,
  ) {}

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
    const payload: {
      tenant_id: string;
      competitor_item_id: string;
      price: number;
      currency?: string;
      captured_at?: string;
      evidence_json?: Record<string, unknown>;
      raw_json?: Record<string, unknown>;
    } = {
      tenant_id: tenantId,
      competitor_item_id: parsed.data.competitor_item_id,
      price: parsed.data.price,
    };
    if (parsed.data.currency !== undefined) {
      payload.currency = parsed.data.currency;
    }
    if (parsed.data.captured_at !== undefined) {
      payload.captured_at = parsed.data.captured_at;
    }
    if (parsed.data.evidence_json !== undefined) {
      payload.evidence_json = parsed.data.evidence_json;
    }
    if (parsed.data.raw_json !== undefined) {
      payload.raw_json = parsed.data.raw_json;
    }

    const jobId = await this.competitorQueueService.enqueueCapture(payload);

    return { enqueued: true, jobId };
  }
}
