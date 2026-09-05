import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../auth/auth.guard';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('api/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.list(user.id);
  }

  /** Polled by the payment-return page; 404 simply means "webhook still in flight". */
  @Get('by-session/:sessionId')
  bySession(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.getBySession(user.id, sessionId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.get(user.id, id);
  }
}
