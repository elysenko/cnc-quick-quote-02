import { Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import { SettingsService } from '../settings/settings.service';
import { StripeService, StripeUnavailableError } from '../integrations/stripe.service';
import { shippingCostCents } from '../shipping/shipping.controller';
import type { ShippingAddress } from '../orders/orders.service';

/** Copy shown when Stripe cannot be reached — the quote is untouched and retryable. */
const PAYMENT_UNAVAILABLE =
  'Payment could not be processed right now. Your quote has not been charged — please try again in a moment.';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly settings: SettingsService,
    private readonly stripe: StripeService,
  ) {}

  async review(userId: string, quoteId: string) {
    const quote = await this.quotes.get(userId, quoteId);
    return {
      quote,
      materialName: quote.materialName,
      quantity: quote.quantity,
      totalCents: quote.totalCents,
    };
  }

  /**
   * Creates the hosted Checkout Session.
   *
   * No Order row is written here — the order is created only when Stripe confirms
   * payment via `checkout.session.completed`. That is what keeps a declined card or a
   * network failure from leaving a phantom paid order behind; the quote stays `draft`
   * and the customer can simply try again.
   */
  async createSession(
    userId: string,
    userEmail: string,
    quoteId: string,
    shippingMethodId: string,
    address: ShippingAddress,
    baseUrl: string,
  ): Promise<{ url: string; sessionId: string }> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, userId },
      include: { material: { select: { name: true } } },
    });
    if (!quote) throw new NotFoundException('That quote could not be found.');
    if (quote.status === 'ordered') {
      throw new UnprocessableEntityException('That quote has already been ordered.');
    }

    const method = await this.prisma.shippingMethod.findFirst({
      where: { id: shippingMethodId, isActive: true },
    });
    if (!method) {
      throw new UnprocessableEntityException('That shipping method is no longer available. Choose another.');
    }

    const shipping = shippingCostCents(method, quote.sheetCount);
    const total = quote.totalCents + shipping;
    const business = await this.settings.business();

    let session: { id: string; url: string };
    try {
      session = await this.stripe.createCheckoutSession({
        customerEmail: userEmail,
        lines: [
          {
            name: `${quote.reference} — ${quote.material.name} × ${quote.quantity}`,
            description: `Laser cut and formed parts, ${quote.sheetCount} sheet${quote.sheetCount === 1 ? '' : 's'}`,
            amountCents: quote.totalCents,
          },
          { name: method.name, description: 'Shipping', amountCents: shipping },
        ],
        successUrl: `${baseUrl}/checkout/${quote.id}/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/checkout/${quote.id}/shipping`,
        metadata: {
          quoteId: quote.id,
          userId,
          shippingMethodId: method.id,
          shippingMethodName: method.name,
          shippingCostCents: String(shipping),
          subtotalCents: String(quote.totalCents),
          totalCents: String(total),
        },
      });
    } catch (error) {
      if (error instanceof StripeUnavailableError) throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
      throw error;
    }

    // The address is parked on the quote's nesting envelope so the webhook — which
    // carries only Stripe metadata — can attach it to the order it creates.
    const nesting = (quote.nestingJson ?? {}) as Record<string, unknown>;
    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        nestingJson: {
          ...nesting,
          pendingCheckout: {
            sessionId: session.id,
            shippingMethodId: method.id,
            shippingMethodName: method.name,
            shippingCostCents: shipping,
            subtotalCents: quote.totalCents,
            totalCents: total,
            address,
            email: userEmail,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { url: session.url, sessionId: session.id };
  }
}
