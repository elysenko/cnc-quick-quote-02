import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { WebhooksController } from './webhooks.controller';
import { QuotesModule } from '../quotes/quotes.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [QuotesModule, OrdersModule],
  controllers: [CheckoutController, WebhooksController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
