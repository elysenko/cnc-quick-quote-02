import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShippingMethod } from '@prisma/client';
import { AdminGuard, AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingCreateDto, ShippingPatchDto } from './shipping.dto';

/** A `perSheet` method scales with the nest; a `flat` method does not. */
export function shippingCostCents(method: ShippingMethod, sheetCount: number): number {
  return method.rateType === 'perSheet' ? method.rateCents * Math.max(1, sheetCount) : method.rateCents;
}

@ApiTags('shipping')
@Controller('api/shipping-methods')
@UseGuards(JwtAuthGuard)
export class ShippingController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active shipping methods, each with the cost computed for the given quote's sheet
   * count. With no active method the workshop cannot ship, so this answers 409 with
   * the "contact the company" copy the checkout UI blocks on — rather than letting a
   * customer reach payment for an unshippable order.
   */
  @Get()
  async list(@Query('quoteId') quoteId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    const methods = await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { rateCents: 'asc' },
    });
    if (methods.length === 0) {
      throw new ConflictException(
        'No shipping methods are available right now. Please contact the company to arrange delivery for this order.',
      );
    }
    let sheetCount = 1;
    if (quoteId) {
      const quote = await this.prisma.quote.findFirst({ where: { id: quoteId, userId: user.id } });
      if (quote) sheetCount = quote.sheetCount;
    }
    return methods.map((method) => ({ ...method, costCents: shippingCostCents(method, sheetCount) }));
  }
}

@ApiTags('admin')
@Controller('api/admin/shipping-methods')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminShippingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.shippingMethod.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Post()
  create(@Body() dto: ShippingCreateDto) {
    return this.prisma.shippingMethod.create({ data: { ...dto, name: dto.name.trim() } });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: ShippingPatchDto) {
    const existing = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That shipping method no longer exists.');
    return this.prisma.shippingMethod.update({ where: { id }, data: dto });
  }

  /** Kept as a deactivation when orders reference it, so order history stays intact. */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const orders = await this.prisma.order.count({ where: { shippingMethodId: id } });
    if (orders > 0) return this.prisma.shippingMethod.update({ where: { id }, data: { isActive: false } });
    return this.prisma.shippingMethod.delete({ where: { id } });
  }
}
