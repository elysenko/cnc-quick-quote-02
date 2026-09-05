import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AdminSettingsController, PublicBusinessController, QuoteConfigController } from './settings.controller';
import { AdminIntegrationsController } from './integrations.controller';

@Global()
@Module({
  controllers: [
    PublicBusinessController,
    QuoteConfigController,
    AdminSettingsController,
    AdminIntegrationsController,
  ],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
