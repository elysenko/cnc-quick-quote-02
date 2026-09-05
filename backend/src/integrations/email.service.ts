import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigResolverService } from '../common/config.service';
import { PrismaService } from '../prisma/prisma.service';

interface ConfirmationPayload {
  orderId: string;
  to: string;
  orderNumber: string;
  confirmationNumber: string;
  companyName: string;
  totalCents: number;
  materialName: string;
  quantity: number;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: ConfigResolverService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Sends the order-confirmation email.
   *
   * CONTRACT: this never throws. The customer has already paid by the time it runs,
   * so a mail-provider outage must not fail order creation or the confirmation page.
   * Every attempt — success, failure, or "no API key configured" — is recorded in
   * EmailLog so an admin can see and retry what did not go out.
   */
  async sendOrderConfirmation(payload: ConfirmationPayload): Promise<void> {
    let status = 'sent';
    let error: string | null = null;
    try {
      const apiKey = await this.config.resolveFirst('RESEND_API_API_KEY', 'RESEND_API_KEY');
      if (!apiKey) {
        status = 'skipped';
        error = 'RESEND_API_API_KEY is not configured; no confirmation email was sent.';
        this.logger.warn(error);
      } else {
        const from = process.env.EMAIL_FROM ?? 'orders@resend.dev';
        const result = await new Resend(apiKey).emails.send({
          from,
          to: payload.to,
          subject: `${payload.companyName} — order ${payload.orderNumber} confirmed`,
          html: this.template(payload),
        });
        if (result.error) {
          status = 'failed';
          error = result.error.message;
        }
      }
    } catch (caught) {
      status = 'failed';
      error = (caught as Error).message;
      this.logger.error(`Confirmation email failed for order ${payload.orderNumber}: ${error}`);
    }

    try {
      await this.prisma.emailLog.create({
        data: { orderId: payload.orderId, status, attempts: 1, error },
      });
    } catch (logError) {
      // Even the audit write must not surface — the order is already paid and stored.
      this.logger.error(`Could not write EmailLog for ${payload.orderNumber}: ${(logError as Error).message}`);
    }
  }

  private template(p: ConfirmationPayload): string {
    return `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h1 style="font-size:20px">Thank you for your order</h1>
        <p>${p.companyName} has received your order and it is now queued for production.</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:6px 0">Order number</td><td style="text-align:right"><strong>${p.orderNumber}</strong></td></tr>
          <tr><td style="padding:6px 0">Confirmation number</td><td style="text-align:right"><strong>${p.confirmationNumber}</strong></td></tr>
          <tr><td style="padding:6px 0">Material</td><td style="text-align:right">${p.materialName}</td></tr>
          <tr><td style="padding:6px 0">Quantity</td><td style="text-align:right">${p.quantity}</td></tr>
          <tr><td style="padding:6px 0;border-top:1px solid #ddd">Total paid</td><td style="text-align:right;border-top:1px solid #ddd"><strong>${money(p.totalCents)}</strong></td></tr>
        </table>
      </div>`;
  }
}
