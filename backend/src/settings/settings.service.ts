import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BusinessSettings, MachineSettings, PricingSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';

const SINGLETON = 'singleton';

/**
 * Owns the three settings singletons. Every row is created on first boot with the
 * schema defaults, so the app is fully operable before an admin touches anything —
 * these are configuration defaults, not seeded sample data.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureDefaults();
    } catch (error) {
      // A cold database must not stop the process from listening — the health
      // endpoint is what reports this, and the first request will retry.
      this.logger.warn(`Could not initialise settings singletons yet: ${(error as Error).message}`);
    }
  }

  async ensureDefaults(): Promise<void> {
    await this.prisma.pricingSettings.upsert({ where: { id: SINGLETON }, update: {}, create: { id: SINGLETON } });
    await this.prisma.machineSettings.upsert({ where: { id: SINGLETON }, update: {}, create: { id: SINGLETON } });
    await this.prisma.businessSettings.upsert({ where: { id: SINGLETON }, update: {}, create: { id: SINGLETON } });
  }

  async pricing(): Promise<PricingSettings> {
    await this.ensureDefaults();
    return this.prisma.pricingSettings.findUniqueOrThrow({ where: { id: SINGLETON } });
  }

  async machine(): Promise<MachineSettings> {
    await this.ensureDefaults();
    return this.prisma.machineSettings.findUniqueOrThrow({ where: { id: SINGLETON } });
  }

  async business(): Promise<BusinessSettings> {
    await this.ensureDefaults();
    return this.prisma.businessSettings.findUniqueOrThrow({ where: { id: SINGLETON } });
  }

  updatePricing(data: Partial<PricingSettings>): Promise<PricingSettings> {
    return this.prisma.pricingSettings.update({ where: { id: SINGLETON }, data });
  }

  updateMachine(data: Partial<MachineSettings>): Promise<MachineSettings> {
    return this.prisma.machineSettings.update({ where: { id: SINGLETON }, data });
  }

  /**
   * Public projection of BusinessSettings. Stripe secrets are WRITE-ONLY: the
   * ciphertext columns never leave the server, only their last four characters.
   */
  async businessView(): Promise<Record<string, string>> {
    const row = await this.business();
    return {
      companyName: row.companyName,
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      supportHours: row.supportHours,
      stripePublishableKey: row.stripePublishableKey,
      stripeSecretLast4: row.stripeSecretLast4,
      stripeWebhookLast4: row.stripeWebhookLast4,
    };
  }

  /**
   * Applies a business patch. A blank/absent secret means "keep the stored value",
   * which is what lets the admin form re-save without re-typing the Stripe keys.
   */
  async updateBusiness(patch: Record<string, unknown>): Promise<Record<string, string>> {
    const data: Record<string, unknown> = {};
    const textFields = [
      'companyName',
      'logoUrl',
      'primaryColor',
      'accentColor',
      'contactEmail',
      'contactPhone',
      'addressLine1',
      'addressLine2',
      'supportHours',
      'stripePublishableKey',
    ];
    for (const field of textFields) {
      if (typeof patch[field] === 'string') data[field] = (patch[field] as string).trim();
    }
    const secret = typeof patch['stripeSecretKey'] === 'string' ? (patch['stripeSecretKey'] as string).trim() : '';
    if (secret) {
      data['stripeSecretKeyEnc'] = this.crypto.encrypt(secret);
      data['stripeSecretLast4'] = this.crypto.maskLast4(secret);
    }
    const webhook =
      typeof patch['stripeWebhookSecret'] === 'string' ? (patch['stripeWebhookSecret'] as string).trim() : '';
    if (webhook) {
      data['stripeWebhookSecretEnc'] = this.crypto.encrypt(webhook);
      data['stripeWebhookLast4'] = this.crypto.maskLast4(webhook);
    }
    await this.ensureDefaults();
    await this.prisma.businessSettings.update({ where: { id: SINGLETON }, data });
    return this.businessView();
  }
}
