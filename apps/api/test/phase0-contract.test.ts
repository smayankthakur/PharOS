import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMPACT_TYPES, RULES, SEVERITY } from '@pharos/types';

describe('Phase 0 frozen contract', () => {
  it('keeps locked rules and impact types', () => {
    expect(RULES).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(IMPACT_TYPES).toEqual(['loss', 'risk', 'dead_value']);
    expect(SEVERITY).toEqual(['medium', 'high', 'critical']);
  });

  it('matches PHASE_0_LOCK.md expectations', () => {
    const lockFile = readFileSync(join(process.cwd(), '..', '..', 'PHASE_0_LOCK.md'), 'utf8');

    expect(lockFile).toContain('Identity: B2B Margin Defense Engine');
    expect(lockFile).toContain('Rules: R1, R2, R3, R4 only');
    expect(lockFile).toContain('Impact metric: Revenue Loss');
  });
});
