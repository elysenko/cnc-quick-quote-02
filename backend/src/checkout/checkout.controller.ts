import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthedRequest, AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../auth/auth.guard';
import { RateLimitService } from '../integrations/ratelimit.service';
import { CheckoutService } from './checkout.service';
import { CheckoutSessionDto } from './checkout.dto';

@ApiTags('checkout')
@Controller('api/checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get(':quoteId/review')
  review(@Param('quoteId') quoteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.checkout.review(user.id, quoteId);
  }

  @Post(':quoteId/session')
  async session(
    @Param('quoteId') quoteId: string,
    @Body() dto: CheckoutSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthedRequest,
  ) {
    await this.rateLimit.enforce({ bucket: 'checkout', limit: 15, windowSeconds: 300 }, request);
    return this.checkout.createSession(
      user.id,
      user.email,
      quoteId,
      dto.shippingMethodId,
      // Optional lines are normalised to '' so the persisted address always has the
      // full nine-field shape the confirmation page renders.
      { ...dto.shippingAddress, company: dto.shippingAddress.company ?? '', line2: dto.shippingAddress.line2 ?? '' },
      this.baseUrl(request),
    );
  }

  /**
   * The SPA origin Stripe returns the customer to. PUBLIC_BASE_URL wins when set;
   * otherwise it is reconstructed from the proxy headers, so the redirect lands on
   * whatever host the user actually came in on.
   */
  private baseUrl(request: AuthedRequest): string {
    const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
    if (configured) return configured;
    const proto = (request.headers['x-forwarded-proto'] as string) ?? request.protocol ?? 'http';
    const host = (request.headers['x-forwarded-host'] as string) ?? request.headers.host ?? 'localhost';
    return `${proto}://${host}`;
  }
}
