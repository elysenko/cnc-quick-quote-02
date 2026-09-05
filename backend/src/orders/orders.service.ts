import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import { SettingsService } from '../settings/settings.service';
import { confirmationNumber, orderNumber } from '../domain/reference';

export interface ShippingAddress {
  fullName: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  phone: string;
}

type OrderWithQuote = Order & { quote: { reference: string; quantity: number; sheetCount: number; materialId: string } };

export interface OrderView {
  id: string;
  quoteId: string;
  quoteReference: string;
  orderNumber: string;
  confirmationNumber: string;
  stripeSessionId: string;
  materialName: string;
  quantity: number;
  sheetCount: number;
  subtotalCents: number;
  shippingMethodName: string;
  shippingCostCents: number;
  totalCents: number;
  shippingAddress: ShippingAddress;
  status: 'paid' | 'in_production' | 'shipped';
  placedAt: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly settings: SettingsService,
  ) {}

  private view(order: OrderWithQuote & { materialName: string }): OrderView {
    return {
      id: order.id,
      quoteId: order.quoteId,
      quoteReference: order.quote.reference,
      orderNumber: order.orderNumber,
      confirmationNumber: order.confirmationNumber,
      stripeSessionId: order.stripeSessionId,
      materialName: order.materialName,
      quantity: order.quote.quantity,
      sheetCount: order.quote.sheetCount,
      subtotalCents: order.subtotalCents,
      shippingMethodName: order.shippingMethodName,
      shippingCostCents: order.shippingCostCents,
      totalCents: order.totalCents,
      shippingAddress: order.shippingAddressJson as unknown as ShippingAddress,
      status: order.status as OrderView['status'],
      placedAt: order.createdAt.toISOString(),
    };
  }

  private readonly include = {
    quote: {
      select: {
        reference: true,
        quantity: true,
        sheetCount: true,
        materialId: true,
        material: { select: { name: true } },
      },
    },
  } as const;

  private async decorate(row: {
    quote: { reference: string; quantity: number; sheetCount: number; materialId: string; material: { name: string } };
  } & Order): Promise<OrderView> {
    return this.view({ ...row, materialName: row.quote.material.name });
  }

  async list(userId: string): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: this.include,
    });
    return Promise.all(rows.map((row) => this.decorate(row)));
  }

  async get(userId: string, id: string): Promise<OrderView> {
    const row = await this.prisma.order.findFirst({ where: { id, userId }, include: this.include });
    if (!row) throw new NotFoundException('That order could not be found.');
    return this.decorate(row);
  }

  /**
   * Looked up by the payment-return page while it polls. A 404 here means "the
   * webhook has not landed yet", which is a normal, expected state — the page keeps
   * backing off rather than declaring failure.
   */
  async getBySession(userId: string, sessionId: string): Promise<OrderView> {
    const row = await this.prisma.order.findFirst({
      where: { stripeSessionId: sessionId, userId },
      include: this.include,
    });
    if (!row) throw new NotFoundException('No order has been recorded for that payment session yet.');
    return this.decorate(row);
  }

  /**
   * Creates the paid order for a completed Checkout Session and flips the quote to
   * `ordered`. Idempotent by `stripeSessionId`: a redelivered webhook returns the
   * existing order instead of creating a second one.
   */
  async createFromSession(params: {
    userId: string;
    quoteId: string;
    sessionId: string;
    paymentIntentId: string | null;
    shippingMethodId: string | null;
    shippingMethodName: string;
    shippingCostCents: number;
    subtotalCents: number;
    totalCents: number;
    address: ShippingAddress;
    email: string;
  }): Promise<OrderView> {
    const existing = await this.prisma.order.findUnique({
      where: { stripeSessionId: params.sessionId },
      include: this.include,
    });
    if (existing) return this.decorate(existing);

    const now = new Date();
    const created = await this.prisma.order.create({
      data: {
        userId: params.userId,
        quoteId: params.quoteId,
        shippingMethodId: params.shippingMethodId,
        shippingMethodName: params.shippingMethodName,
        shippingCostCents: params.shippingCostCents,
        subtotalCents: params.subtotalCents,
        shippingAddressJson: params.address as unknown as Prisma.InputJsonValue,
        totalCents: params.totalCents,
        orderNumber: orderNumber(now),
        confirmationNumber: confirmationNumber(),
        stripeSessionId: params.sessionId,
        stripePaymentIntentId: params.paymentIntentId,
        status: 'paid',
      },
      include: this.include,
    });
    await this.prisma.quote.update({ where: { id: params.quoteId }, data: { status: 'ordered' } });

    const view = await this.decorate(created);
    // Fire-and-forget by contract: sendOrderConfirmation never throws, it logs to
    // EmailLog. The customer has paid — a mail outage must not fail this path.
    const business = await this.settings.business();
    void this.email.sendOrderConfirmation({
      orderId: created.id,
      to: params.email,
      orderNumber: created.orderNumber,
      confirmationNumber: created.confirmationNumber,
      companyName: business.companyName,
      totalCents: created.totalCents,
      materialName: view.materialName,
      quantity: view.quantity,
    });
    return view;
  }
}
