import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../integrations/stripe.service';
import { OrdersService, ShippingAddress } from '../orders/orders.service';

interface PendingCheckout {
  sessionId: string;
  shippingMethodId: string;
  shippingMethodName: string;
  shippingCostCents: number;
  subtotalCents: number;
  totalCents: number;
  address: ShippingAddress;
  email: string;
}

/**
 * Stripe webhook receiver.
 *
 * Unauthenticated by design — Stripe cannot present a bearer token, so the raw-body
 * HMAC signature IS the authentication. `main.ts` preserves `request.rawBody` for
 * exactly this route, because signature verification must run against the bytes
 * Stripe signed, not a re-serialised JSON object.
 */
@ApiExcludeController()
@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = request.rawBody;
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or request body.');
    }

    let event: Stripe.Event;
    try {
      event = await this.stripe.constructEvent(rawBody, signature);
    } catch (error) {
      // A tampered or unsigned payload changes NOTHING: log and reject.
      this.logger.warn(`Rejected Stripe webhook with an invalid signature: ${(error as Error).message}`);
      throw new BadRequestException('Stripe signature verification failed.');
    }

    // Idempotency ledger. The unique constraint on stripeEventId means a redelivery
    // of the same event is a no-op, so one payment can only ever make one order.
    try {
      await this.prisma.webhookEvent.create({ data: { stripeEventId: event.id, type: event.type } });
    } catch {
      this.logger.log(`Stripe event ${event.id} already processed — ignoring redelivery.`);
      return { received: true, duplicate: true };
    }

    if (event.type === 'checkout.session.completed') {
      await this.completeCheckout(event.data.object as Stripe.Checkout.Session);
    }
    return { received: true };
  }

  private async completeCheckout(session: Stripe.Checkout.Session): Promise<void> {
    const quoteId = session.metadata?.['quoteId'];
    const userId = session.metadata?.['userId'];
    if (!quoteId || !userId) {
      this.logger.warn(`checkout.session.completed ${session.id} carried no quote metadata — skipping.`);
      return;
    }
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      this.logger.warn(`checkout.session.completed ${session.id} referenced unknown quote ${quoteId}.`);
      return;
    }

    const nesting = (quote.nestingJson ?? {}) as { pendingCheckout?: PendingCheckout };
    const pending = nesting.pendingCheckout;
    const shippingCostCents = pending?.shippingCostCents ?? Number(session.metadata?.['shippingCostCents'] ?? 0);
    const subtotalCents = pending?.subtotalCents ?? quote.totalCents;

    await this.orders.createFromSession({
      userId,
      quoteId,
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      shippingMethodId: pending?.shippingMethodId ?? session.metadata?.['shippingMethodId'] ?? null,
      shippingMethodName: pending?.shippingMethodName ?? session.metadata?.['shippingMethodName'] ?? 'Shipping',
      shippingCostCents,
      subtotalCents,
      totalCents: session.amount_total ?? subtotalCents + shippingCostCents,
      address: pending?.address ?? this.addressFromSession(session),
      email: pending?.email ?? session.customer_email ?? session.customer_details?.email ?? '',
    });
  }

  /** Fallback when the pending envelope is gone: rebuild from Stripe's own record. */
  private addressFromSession(session: Stripe.Checkout.Session): ShippingAddress {
    const details = session.customer_details;
    const address = details?.address;
    return {
      fullName: details?.name ?? '',
      company: '',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      city: address?.city ?? '',
      region: address?.state ?? '',
      postcode: address?.postal_code ?? '',
      country: address?.country ?? '',
      phone: details?.phone ?? '',
    };
  }
}
