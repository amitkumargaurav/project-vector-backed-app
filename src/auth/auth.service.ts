import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly googleAudiences: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.googleAudiences = parseGoogleClientIds(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_IDS'),
    );
    if (this.googleAudiences.length === 0) {
      throw new Error('At least one Google OAuth client ID must be configured.');
    }
    this.googleClient = new OAuth2Client(this.googleAudiences[0]);
  }

  async loginWithGoogle(idToken: string, userAgent?: string) {
    let ticket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleAudiences,
      });
    } catch {
      throw new UnauthorizedException('Invalid Google identity token.');
    }
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) throw new UnauthorizedException('Invalid Google identity token.');

    const user = await this.prisma.user.upsert({
      where: { email: payload.email },
      update: {
        googleSub: payload.sub,
        displayName: payload.name,
        avatarUrl: payload.picture,
      },
      create: {
        email: payload.email,
        googleSub: payload.sub,
        displayName: payload.name,
        avatarUrl: payload.picture,
        profile: { create: { timezone: 'UTC' } },
        preferences: { create: {} },
        privacySettings: { create: {} },
      },
      include: { profile: true, preferences: true, privacySettings: true },
    });

    const tokens = await this.issueTokens(user.id, user.email, userAgent);
    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync<{ sub: string; email: string; sessionId: string }>(refreshToken, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
    const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }
    const ok = await bcrypt.compare(refreshToken, session.refreshHash);
    if (!ok) throw new UnauthorizedException('Refresh session is no longer valid.');
    return this.issueTokens(payload.sub, payload.email, session.userAgent ?? undefined, session.id);
  }

  async logout(userId: string, refreshToken?: string) {
    if (!refreshToken) {
      await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return;
    }
    const payload = await this.jwt.verifyAsync<{ sessionId: string }>(refreshToken, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
    await this.prisma.session.updateMany({ where: { id: payload.sessionId, userId }, data: { revokedAt: new Date() } });
  }

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preferences: true, privacySettings: true },
    });
  }

  private async issueTokens(userId: string, email: string, userAgent?: string, existingSessionId?: string) {
    const sessionId = existingSessionId ?? randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, sessionId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d') as never,
      },
    );
    const refreshHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.session.upsert({
      where: { id: sessionId },
      update: { refreshHash, expiresAt, revokedAt: null },
      create: { id: sessionId, userId, refreshHash, userAgent, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}

export function parseGoogleClientIds(primary?: string, additional?: string): string[] {
  return Array.from(
    new Set(
      [primary, ...(additional ?? '').split(',')]
        .map((clientId) => clientId?.trim())
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
}
