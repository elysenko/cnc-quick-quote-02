import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard, JwtAuthGuard } from '../auth/auth.guard';
import { ConfigResolverService } from '../common/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialDto } from './settings.dto';

interface CatalogEntry {
  key: string;
  label: string;
  kind: 'service' | 'integration';
  description: string;
}

/**
 * The credential catalogue rendered by /admin/settings. Backing services are listed
 * read-only (the platform injects them); third-party integrations are editable so a
 * workshop owner can supply their own keys without a redeploy.
 */
const CATALOG: CatalogEntry[] = [
  {
    key: 'DATABASE_URL',
    label: 'PostgreSQL',
    kind: 'service',
    description: 'Primary application database.',
  },
  {
    key: 'MINIO_ENDPOINT',
    label: 'MinIO',
    kind: 'service',
    description: 'Object storage service for uploaded drawings.',
  },
  {
    key: 'STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY',
    label: 'Stripe SDK (Python) + Stripe Checkout Sessions',
    kind: 'integration',
    description: 'Hosted card payment and webhook events.',
  },
  {
    key: 'RESEND_API_API_KEY',
    label: 'Resend API',
    kind: 'integration',
    description: 'Transactional order-confirmation email.',
  },
  {
    key: 'MINIO_S3_BOTO3_API_KEY',
    label: 'MinIO / S3 (boto3)',
    kind: 'integration',
    description: 'CAD drawing object storage credentials.',
  },
  {
    key: 'REDIS_API_KEY',
    label: 'Redis',
    kind: 'integration',
    description: 'API rate limiting and refresh-token revocation cache.',
  },
];

/**
 * Masks a credential for read-back. Never returns the secret itself: a URL keeps its
 * scheme and host so an admin can confirm WHICH endpoint is wired, and an opaque key
 * shows only its last four characters.
 */
function mask(value: string): string {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      const url = new URL(value);
      const auth = url.username ? '••••@' : '';
      return `${url.protocol}//${auth}${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    }
  } catch {
    // Not a URL — fall through to the opaque form.
  }
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

@ApiTags('admin')
@Controller('api/admin/integrations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminIntegrationsController {
  constructor(
    private readonly config: ConfigResolverService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list() {
    return Promise.all(
      CATALOG.map(async (entry) => {
        const value = await this.config.resolveConfig(entry.key);
        return {
          key: entry.key,
          label: entry.label,
          kind: entry.kind,
          description: entry.description,
          configured: value !== null,
          maskedValue: value === null ? '' : mask(value),
        };
      }),
    );
  }

  @Put(':key')
  async save(@Param('key') key: string, @Body() dto: CredentialDto) {
    await this.config.upsert(key, dto.value.trim());
    const stored = await this.config.resolveConfig(key);
    return { key, configured: stored !== null, maskedValue: stored === null ? '' : mask(stored) };
  }

  @Delete(':key')
  async clear(@Param('key') key: string) {
    await this.prisma.systemSetting.deleteMany({ where: { key } });
    // An env-injected value survives clearing the DB override — report the truth.
    const stored = await this.config.resolveConfig(key);
    return { key, configured: stored !== null, maskedValue: stored === null ? '' : mask(stored) };
  }
}
