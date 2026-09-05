import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { MaterialsModule } from './materials/materials.module';
import { ShippingModule } from './shipping/shipping.module';
import { DrawingsModule } from './drawings/drawings.module';
import { QuotesModule } from './quotes/quotes.module';
import { OrdersModule } from './orders/orders.module';
import { CheckoutModule } from './checkout/checkout.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    IntegrationsModule,
    AuthModule,
    SettingsModule,
    HealthModule,
    MaterialsModule,
    ShippingModule,
    DrawingsModule,
    QuotesModule,
    OrdersModule,
    CheckoutModule,
  ],
})
export class AppModule {}
