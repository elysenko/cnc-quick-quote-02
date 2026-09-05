import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export type AuthedRequest = Request & { user?: AuthenticatedUser };

/** Rejects anonymous requests with 401. Attaches `request.user` on success. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw new UnauthorizedException('Sign in to continue.');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; role: Role; typ: string }>(token);
      if (payload.typ !== 'access') throw new Error('wrong token type');
      request.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
  }
}

/**
 * Admin gate. Ordering matters and is enforced by construction: this guard runs
 * AFTER JwtAuthGuard, so an anonymous caller has already been rejected with 401 and
 * only an authenticated non-admin can reach the 403 branch.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) throw new UnauthorizedException('Sign in to continue.');
    if (request.user.role !== Role.ADMIN) {
      throw new ForbiddenException('This area is restricted to administrators.');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<AuthedRequest>();
  if (!request.user) throw new UnauthorizedException('Sign in to continue.');
  return request.user;
});
