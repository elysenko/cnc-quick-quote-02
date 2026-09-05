import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Matches prisma/seed/seed.js so a platform-minted password verifies unchanged. */
const BCRYPT_ROUNDS = 10;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * One message for both "no such email" and "wrong password". Distinguishing them
 * turns the login form into an account-enumeration oracle.
 */
const CREDENTIALS_REJECTED = 'That email and password combination was not recognised.';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private toSession(user: User): SessionUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  /**
   * First account in an empty User table becomes ADMIN; every later signup is USER.
   * In a Colossus deployment the platform seed has already created its accounts, so
   * this branch normally yields USER — which is the intended, safe outcome.
   */
  async register(email: string, password: string, name: string | null): Promise<TokenPair> {
    const normalised = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalised } });
    if (existing) {
      throw new ConflictException('An account with that email address already exists. Sign in instead.');
    }
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const user = await this.prisma.user.create({
      data: {
        email: normalised,
        name: name?.trim() || null,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: isFirstUser ? Role.ADMIN : Role.USER,
      },
    });
    return this.issue(user);
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Hash a throwaway value when the account is unknown so the response time does
    // not reveal whether the email exists.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw new UnauthorizedException(CREDENTIALS_REJECTED);
    return this.issue(user);
  }

  /**
   * Rotation: the presented jti is revoked and a fresh pair minted. Re-presenting a
   * revoked or expired jti is a hard 401 — that is what makes a stolen refresh token
   * single-use.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; jti: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Your session has expired. Please sign in again.');

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Your session has expired. Please sign in again.');

    await this.prisma.refreshToken.update({
      where: { jti: payload.jti },
      data: { revokedAt: new Date() },
    });
    return this.issue(user);
  }

  /** Idempotent: logging out with an already-revoked or unknown token still succeeds. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { jti: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // An unparseable token has nothing to revoke; the client clears it either way.
    }
  }

  async me(userId: string): Promise<SessionUser & { createdAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Your session is no longer valid.');
    return { ...this.toSession(user), createdAt: user.createdAt };
  }

  private async issue(user: User): Promise<TokenPair> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
    await this.prisma.refreshToken.create({ data: { jti, userId: user.id, expiresAt } });
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, email: user.email, role: user.role, typ: 'access' },
        { expiresIn: ACCESS_TTL_SECONDS },
      ),
      this.jwt.signAsync({ sub: user.id, jti, typ: 'refresh' }, { expiresIn: REFRESH_TTL_SECONDS }),
    ]);
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS, user: this.toSession(user) };
  }
}
