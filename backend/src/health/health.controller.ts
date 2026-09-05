import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../integrations/redis.service';
import { StorageService } from '../integrations/storage.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness. Deliberately dependency-free: it must answer while Postgres is down,
   * otherwise Kubernetes restarts a perfectly healthy pod during a database blip. */
  @Get(['health', 'api/health'])
  check(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Readiness. Probes every backing service and reports per-dependency status
   * WITHOUT throwing, so an operator sees which one is broken rather than a 500.
   */
  @Get(['health/deep', 'api/health/deep'])
  async deep() {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.redis.check(),
      this.storage.check(),
    ]);
    const degraded = [database, redis, storage].some((entry) => entry.status === 'down');
    return { status: degraded ? 'degraded' : 'ok', database, redis, storage };
  }

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; message?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', message: (error as Error).message };
    }
  }
}
