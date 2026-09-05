import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Material, Prisma, Quote } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { computeNesting, Placement } from '../domain/nesting';
import { BreakdownLine, PricingConfig, priceQuote } from '../domain/pricing';
import { quoteReference } from '../domain/reference';

export interface QuoteView {
  id: string;
  reference: string;
  drawingId: string;
  drawingName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  cutLengthMmTotal: number;
  bendCount: number;
  sheetCount: number;
  utilization: number;
  perSheet: number;
  placements: Placement[];
  breakdown: BreakdownLine[];
  totalCents: number;
  status: 'draft' | 'ordered' | 'expired';
  createdAt: string;
}

type QuoteWithRelations = Quote & { drawing: { filename: string }; material: { name: string } };

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  toView(quote: QuoteWithRelations): QuoteView {
    const nesting = quote.nestingJson as { placements?: Placement[] } | null;
    return {
      id: quote.id,
      reference: quote.reference,
      drawingId: quote.drawingId,
      drawingName: quote.drawing.filename,
      materialId: quote.materialId,
      materialName: quote.material.name,
      quantity: quote.quantity,
      cutLengthMmTotal: quote.cutLengthMmTotal,
      bendCount: quote.bendCount,
      sheetCount: quote.sheetCount,
      utilization: quote.utilization,
      perSheet: quote.perSheet,
      placements: nesting?.placements ?? [],
      breakdown: (quote.breakdownJson as unknown as BreakdownLine[]) ?? [],
      totalCents: quote.totalCents,
      status: quote.status as QuoteView['status'],
      createdAt: quote.createdAt.toISOString(),
    };
  }

  /**
   * Issues a quote.
   *
   * The pricing settings in force at this instant are copied into
   * `pricingSnapshotJson` and the resulting total is frozen on the row. A later admin
   * price change therefore cannot retroactively alter a number a customer was already
   * shown — new quotes get the new prices, issued quotes keep theirs.
   */
  async create(userId: string, drawingId: string, materialId: string, quantity: number): Promise<QuoteView> {
    const pricing = await this.settings.pricing();
    const machine = await this.settings.machine();

    if (!Number.isInteger(quantity) || quantity < pricing.qtyMin) {
      throw new UnprocessableEntityException(`Enter a quantity of at least ${pricing.qtyMin}.`);
    }
    if (quantity > pricing.qtyMax) {
      throw new UnprocessableEntityException(`Quantity must be ${pricing.qtyMax} or fewer per quote.`);
    }

    const drawing = await this.prisma.drawing.findFirst({ where: { id: drawingId, userId } });
    if (!drawing) throw new NotFoundException('That drawing could not be found.');

    const material: Material | null = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new UnprocessableEntityException('That material could not be found. Choose another material.');
    if (!material.isActive) {
      throw new UnprocessableEntityException(
        'That material was deactivated by the workshop while you were quoting. Choose another material to continue.',
      );
    }

    // Throws PartTooLargeError (422) when the part cannot fit the usable sheet area.
    const nesting = computeNesting(
      drawing.bboxWMm,
      drawing.bboxHMm,
      quantity,
      material.sheetWidthMm,
      material.sheetHeightMm,
      machine.sheetSpacingMm,
      machine.sheetMarginMm,
    );

    const bendCount = await this.prisma.bendLine.count({ where: { drawingId } });
    const cutLengthMmTotal = drawing.cutLengthMm * quantity;
    const config: PricingConfig = {
      setupFeeCents: pricing.setupFeeCents,
      costPerLinearFootCents: pricing.costPerLinearFootCents,
      perSheetCostCents: pricing.perSheetCostCents,
      handlingFeeCents: pricing.handlingFeeCents,
      costPerBendCents: pricing.costPerBendCents,
      minimumOrderCents: pricing.minimumOrderCents,
      qtyMin: pricing.qtyMin,
      qtyMax: pricing.qtyMax,
    };
    const priced = priceQuote(cutLengthMmTotal, nesting.sheets, bendCount, material.costMultiplier, config);

    const created = await this.prisma.quote.create({
      data: {
        reference: quoteReference(),
        userId,
        drawingId,
        materialId,
        quantity,
        cutLengthMmTotal,
        bendCount,
        sheetCount: nesting.sheets,
        perSheet: nesting.perSheet,
        utilization: nesting.utilization,
        nestingJson: {
          placements: nesting.placements,
          perSheet: nesting.perSheet,
          cols: nesting.cols,
          rows: nesting.rows,
        } as unknown as Prisma.InputJsonValue,
        pricingSnapshotJson: {
          ...config,
          materialMultiplier: material.costMultiplier,
        } as unknown as Prisma.InputJsonValue,
        breakdownJson: priced.breakdown as unknown as Prisma.InputJsonValue,
        totalCents: priced.totalCents,
        status: 'draft',
      },
      include: { drawing: { select: { filename: true } }, material: { select: { name: true } } },
    });
    return this.toView(created);
  }

  async list(userId: string, status?: string): Promise<QuoteView[]> {
    const rows = await this.prisma.quote.findMany({
      where: { userId, ...(status && status !== 'all' ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { drawing: { select: { filename: true } }, material: { select: { name: true } } },
    });
    return rows.map((row) => this.toView(row));
  }

  /** Owner-scoped lookup — a quote belonging to another account reads as missing. */
  async get(userId: string, id: string): Promise<QuoteView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      include: { drawing: { select: { filename: true } }, material: { select: { name: true } } },
    });
    if (!quote) throw new NotFoundException('That quote could not be found.');
    return this.toView(quote);
  }
}
