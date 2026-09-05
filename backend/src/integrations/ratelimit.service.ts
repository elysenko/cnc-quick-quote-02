import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from './redis.service';

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/** 429 carrying Retry-After, so a client can back off precisely instead of guessing. */
export class RateLimitExceededException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many requests in a short time. Please try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Fixed-window limiter keyed on the authenticated user when there is one, and the
   * client IP otherwise — so an anonymous flood cannot be hidden behind one shared
   * bucket, and a signed-in user's limit follows them across devices.
   */
  async enforce(rule: RateLimitRule, request: Request & { user?: { id: string } }): Promise<void> {
    const identity = request.user?.id ?? this.clientIp(request);
    const key = `ratelimit:${rule.bucket}:${identity}`;
    const { count, resetSeconds } = await this.redis.incrementWindow(key, rule.windowSeconds);
    if (count > rule.limit) {
      // Retry-After is the HTTP-level contract every client understands; the JSON
      // body repeats the same number for the SPA, which reads it to word the notice.
      request.res?.setHeader('Retry-After', String(resetSeconds));
      throw new RateLimitExceededException(resetSeconds);
    }
  }

  private clientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }
}
