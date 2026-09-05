import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigResolverService } from '../common/config.service';
import { CryptoService } from '../common/crypto.service';
import { ServiceUnconfiguredError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

/** Raised when Stripe is reachable-but-failing. Mapped to 503 by the controller. */
export class StripeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeUnavailableError';
  }
}

export interface CheckoutLine {
  name: string;
  description: string;
  amountCents: number;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly config: ConfigResolverService,
    private readonly crypto: CryptoService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Secret key resolution: pod env / SystemSetting first, then the admin-entered key
   * encrypted in BusinessSettings. The admin path exists because a workshop owner
   * enters their own Stripe account without a redeploy.
   */
  private async secretKey(): Promise<string> {
    const fromConfig = await this.config.resolveFirst(
      'STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY',
      'STRIPE_SECRET_KEY',
    );
    if (fromConfig) return fromConfig;
    const business = await this.prisma.businessSettings.findUnique({ where: { id: 'singleton' } });
    const decrypted = this.crypto.decrypt(business?.stripeSecretKeyEnc);
    if (decrypted) return decrypted;
    throw new ServiceUnconfiguredError(
      'STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY',
      'Card payment is not configured yet. Please contact the company to complete your order.',
    );
  }

  async webhookSecret(): Promise<string> {
    const fromConfig = await this.config.resolveFirst('STRIPE_WEBHOOK_SECRET');
    if (fromConfig) return fromConfig;
    const business = await this.prisma.businessSettings.findUnique({ where: { id: 'singleton' } });
    const decrypted = this.crypto.decrypt(business?.stripeWebhookSecretEnc);
    if (decrypted) return decrypted;
    throw new ServiceUnconfiguredError(
      'STRIPE_WEBHOOK_SECRET',
      'The Stripe webhook signing secret is not configured.',
    );
  }

  private async client(): Promise<Stripe> {
    return new Stripe(await this.secretKey(), { maxNetworkRetries: 1, timeout: 15_000 });
  }

  /** True when checkout can be attempted at all — drives the "contact us" UI block. */
  async isConfigured(): Promise<boolean> {
    try {
      await this.secretKey();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a hosted Checkout Session. Connection/timeout failures are re-thrown as
   * StripeUnavailableError so the caller answers 503 WITHOUT having written an order
   * row — a partial order for an unpaid session is worse than a retryable failure.
   */
  async createCheckoutSession(params: {
    lines: CheckoutLine[];
    successUrl: string;
    cancelUrl: string;
    customerEmail: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }> {
    let stripe: Stripe;
    try {
      stripe = await this.client();
    } catch (error) {
      if (error instanceof ServiceUnconfiguredError) throw error;
      throw new StripeUnavailableError((error as Error).message);
    }
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: params.customerEmail,
        line_items: params.lines.map((line) => ({
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: line.amountCents,
            product_data: { name: line.name, description: line.description || undefined },
          },
        })),
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      });
      if (!session.url) throw new StripeUnavailableError('Stripe returned a session without a redirect URL.');
      return { id: session.id, url: session.url };
    } catch (error) {
      if (error instanceof StripeUnavailableError) throw error;
      const err = error as Stripe.errors.StripeError;
      this.logger.error(`Stripe checkout session failed: ${err.type ?? 'unknown'} ${err.message}`);
      if (
        err.type === 'StripeConnectionError' ||
        err.type === 'StripeAPIError' ||
        err.type === 'StripeRateLimitError' ||
        (err as unknown as { code?: string }).code === 'ETIMEDOUT'
      ) {
        throw new StripeUnavailableError(err.message);
      }
      throw new StripeUnavailableError(err.message ?? 'Stripe request failed.');
    }
  }

  /**
   * Verifies a webhook against the raw request body. Throws on a bad signature —
   * the caller must answer 400 and change NO state.
   */
  async constructEvent(rawBody: Buffer, signature: string): Promise<Stripe.Event> {
    const secret = await this.webhookSecret();
    const stripe = await this.client();
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}
