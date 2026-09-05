import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceUnconfiguredError } from './errors';

/**
 * Scaffolder-injected sentinel. A key holding this value is treated as ABSENT so the
 * SystemSetting fallback tier (populated from /admin/settings) can take over.
 */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

const isUsable = (v: string | undefined | null): v is string =>
  typeof v === 'string' && v.trim() !== '' && v.trim() !== PLACEHOLDER;

@Injectable()
export class ConfigResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolution order: `process.env[key]` → `SystemSetting[key]` → null.
   * Never throws for a missing key — callers decide whether absence is fatal
   * (`require`) or merely degrades a feature.
   */
  async resolveConfig(key: string): Promise<string | null> {
    const fromEnv = process.env[key];
    if (isUsable(fromEnv)) return fromEnv.trim();
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      return isUsable(row?.value) ? row!.value.trim() : null;
    } catch {
      // The settings table is unreachable — treat as unconfigured rather than
      // taking the whole request down with a database error.
      return null;
    }
  }

  /** Same as resolveConfig but throws ServiceUnconfiguredError (503) when absent. */
  async require(key: string): Promise<string> {
    const value = await this.resolveConfig(key);
    if (value === null) throw new ServiceUnconfiguredError(key);
    return value;
  }

  /** First non-null of several candidate keys — used where env naming varies. */
  async resolveFirst(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const value = await this.resolveConfig(key);
      if (value !== null) return value;
    }
    return null;
  }

  async upsert(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
