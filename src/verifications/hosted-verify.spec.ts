import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { signResult, verifyResult } from './result-token';
import { VerificationsService } from './verifications.service';

describe('verification result token', () => {
  const result = { id: 'ver-1', status: 'VERIFIED' as const, phone: '251911223344', reason: null, environment: 'live' as const };

  it('round-trips with the right secret', () => {
    expect(verifyResult(signResult(result, 'whsec_a'), 'whsec_a')).toMatchObject(result);
  });

  it('rejects a wrong secret, a tampered payload and an expired token', () => {
    const token = signResult(result, 'whsec_a');
    expect(verifyResult(token, 'whsec_b')).toBeNull();
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...result, phone: '251900000000', iat: 0, exp: 9e9 })).toString('base64url');
    expect(verifyResult(`${forged}.${sig}`, 'whsec_a')).toBeNull();
    expect(verifyResult(signResult(result, 'whsec_a', Date.now() - 11 * 60_000), 'whsec_a')).toBeNull();
    expect(verifyResult('garbage', 'whsec_a')).toBeNull();
  });
});

describe('VerificationsService.createPublic', () => {
  function setup(environment: object | null) {
    const prisma = {
      environment: { findUnique: jest.fn().mockResolvedValue(environment) },
      verification: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ver-9', status: 'PENDING', token: 't', ...data })) },
    };
    const telegram = { botUsernameFor: jest.fn().mockReturnValue('shop_bot') };
    const service = new VerificationsService(
      prisma as any,
      telegram as any,
      {} as any,
      {} as any,
      { assertWithinQuota: jest.fn() } as any,
      { get: (_k: string, d: unknown) => (_k === 'PORTAL_URL' ? 'https://portal.test' : d) } as any,
      { offer: jest.fn(), enabled: () => false, joinUrl: jest.fn().mockResolvedValue(null), replaceRequest: jest.fn() } as any,
    );
    return { service, prisma };
  }
  const live = { id: 'env-1', type: 'LIVE', allowedOrigins: ['https://shop.example'], org: { name: 'Shop' } };

  it('starts a session from an allowed website, without linking any customer', async () => {
    const { service, prisma } = setup(live);
    const created = await service.createPublic({ publishableKey: 'tn_pk_live_abc', origin: 'https://shop.example', phone: '0911223344' });
    expect(created).toEqual({ id: 'ver-9', hostedUrl: 'https://portal.test/verify/ver-9' });
    expect(prisma.verification.create.mock.calls[0][0].data).toMatchObject({ origin: 'https://shop.example', expectedPhone: '251911223344' });
    expect(prisma.verification.create.mock.calls[0][0].data.externalId).toBeUndefined();
  });

  it('refuses websites that are not allowed in live, and unknown keys', async () => {
    await expect(setup(live).service.createPublic({ publishableKey: 'tn_pk_live_abc', origin: 'https://evil.example' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup(null).service.createPublic({ publishableKey: 'tn_pk_live_nope', origin: 'https://shop.example' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows any website in the sandbox, e.g. localhost', async () => {
    const { service } = setup({ ...live, type: 'SANDBOX', allowedOrigins: [] });
    await expect(service.createPublic({ publishableKey: 'tn_pk_test_abc', returnUrl: 'http://localhost:5173/done' })).resolves.toMatchObject({ id: 'ver-9' });
  });
});
