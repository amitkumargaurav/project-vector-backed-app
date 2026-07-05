import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService, parseGoogleClientIds } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthService Google auth', () => {
  it('parses and deduplicates configured Google client IDs', () => {
    expect(parseGoogleClientIds('web-client', 'android-client, ios-client, web-client')).toEqual([
      'web-client',
      'android-client',
      'ios-client',
    ]);
  });

  it('verifies Google ID tokens against all configured audiences', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as JwtService,
      {
        get: jest.fn((key: string) => {
          if (key === 'GOOGLE_CLIENT_ID') return 'web-client';
          if (key === 'GOOGLE_CLIENT_IDS') return 'android-client,ios-client';
          return undefined;
        }),
      } as unknown as ConfigService,
    );
    const verifyIdToken = jest.fn().mockRejectedValue(new Error('Wrong recipient'));
    (service as unknown as { googleClient: { verifyIdToken: jest.Mock } }).googleClient.verifyIdToken = verifyIdToken;

    await expect(service.loginWithGoogle('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'bad-token',
      audience: ['web-client', 'android-client', 'ios-client'],
    });
  });
});
