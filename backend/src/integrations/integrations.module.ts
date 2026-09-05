import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { RedisService } from './redis.service';
import { StripeService } from './stripe.service';
import { EmailService } from './email.service';
import { RateLimitService } from './ratelimit.service';

@Global()
@Module({
  providers: [StorageService, RedisService, StripeService, EmailService, RateLimitService],
  exports: [StorageService, RedisService, StripeService, EmailService, RateLimitService],
})
export class IntegrationsModule {}
