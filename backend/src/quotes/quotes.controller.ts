import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthedRequest, AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../auth/auth.guard';
import { RateLimitService } from '../integrations/ratelimit.service';
import { QuotesService } from './quotes.service';
import { QuoteCreateDto } from './quotes.dto';

@ApiTags('quotes')
@Controller('api/quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async create(
    @Body() dto: QuoteCreateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthedRequest,
  ) {
    await this.rateLimit.enforce({ bucket: 'quotes', limit: 20, windowSeconds: 60 }, request);
    return this.quotes.create(user.id, dto.drawingId, dto.materialId, dto.quantity);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.quotes.list(user.id, status);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotes.get(user.id, id);
  }
}
