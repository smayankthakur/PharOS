import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'feature_flag';

export const RequireFeature = (flagName: string): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_FLAG_KEY, flagName);
