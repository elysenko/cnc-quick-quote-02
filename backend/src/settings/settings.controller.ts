import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard, JwtAuthGuard } from '../auth/auth.guard';
import { SettingsService } from './settings.service';
import { MachinePatchDto, PricingPatchDto } from './settings.dto';

/**
 * Branding is readable by everyone — the sign-in page renders the company name and
 * colours before any session exists. Secrets are excluded from this projection.
 */
@ApiTags('settings')
@Controller('api/business-settings')
export class PublicBusinessController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.businessView();
  }
}

/**
 * Customer-facing quoting configuration.
 *
 * The quote wizard needs the same limits the server enforces — accepted extensions
 * and upload size for the file picker, qtyMin/qtyMax for quantity validation, sheet
 * spacing/margin and animation speed for the work-bed preview — so it can show a
 * live estimate and reject bad input before a round trip. These are operating
 * parameters, not secrets, so they are readable by any signed-in customer while the
 * admin WRITE endpoints stay behind AdminGuard.
 */
@ApiTags('settings')
@Controller('api/quote-config')
@UseGuards(JwtAuthGuard)
export class QuoteConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    const [pricing, machine] = await Promise.all([this.settings.pricing(), this.settings.machine()]);
    return {
      pricing: {
        setupFeeCents: pricing.setupFeeCents,
        costPerLinearFootCents: pricing.costPerLinearFootCents,
        perSheetCostCents: pricing.perSheetCostCents,
        handlingFeeCents: pricing.handlingFeeCents,
        costPerBendCents: pricing.costPerBendCents,
        minimumOrderCents: pricing.minimumOrderCents,
        qtyMin: pricing.qtyMin,
        qtyMax: pricing.qtyMax,
      },
      machine: {
        sheetSpacingMm: machine.sheetSpacingMm,
        sheetMarginMm: machine.sheetMarginMm,
        allowedExtensions: machine.allowedExtensions,
        maxUploadBytes: machine.maxUploadBytes,
        animationSpeed: machine.animationSpeed,
      },
    };
  }
}

@ApiTags('admin')
@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('pricing')
  pricing() {
    return this.settings.pricing();
  }

  @Patch('pricing')
  updatePricing(@Body() dto: PricingPatchDto) {
    return this.settings.updatePricing(dto);
  }

  @Get('machine')
  machine() {
    return this.settings.machine();
  }

  @Patch('machine')
  updateMachine(@Body() dto: MachinePatchDto) {
    return this.settings.updateMachine(dto);
  }

  @Get('business')
  business() {
    return this.settings.businessView();
  }

  @Patch('business')
  updateBusiness(@Body() body: Record<string, unknown>) {
    return this.settings.updateBusiness(body);
  }
}
