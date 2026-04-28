import { UnauthorizedException } from '@nestjs/common';
import { SignedUrlService } from './signed-url.service';

describe('SignedUrlService', () => {
  let service: SignedUrlService;

  beforeEach(() => {
    process.env.MEDIA_SIGNED_URL_SECRET = 'unit-test-secret-please-change';
    service = new SignedUrlService();
    service.onModuleInit();
  });

  it('issues and verifies a token for the same op', () => {
    const { token } = service.issue('media-1', 'put', 60);
    const claims = service.verify(token, 'put');
    expect(claims.pid).toBe('media-1');
    expect(claims.op).toBe('put');
  });

  it('rejects a token used for the wrong op', () => {
    const { token } = service.issue('media-1', 'put', 60);
    expect(() => service.verify(token, 'get')).toThrow(UnauthorizedException);
  });

  it('rejects an expired token', () => {
    const { token } = service.issue('media-1', 'get', 1);
    const realDateNow = Date.now;
    Date.now = () => realDateNow() + 10_000;
    try {
      expect(() => service.verify(token, 'get')).toThrow(UnauthorizedException);
    } finally {
      Date.now = realDateNow;
    }
  });

  it('rejects a tampered signature', () => {
    const { token } = service.issue('media-1', 'put', 60);
    const [payload, sig] = token.split('.');
    const tampered = `${payload}.${sig.slice(0, -1)}A`;
    expect(() => service.verify(tampered, 'put')).toThrow(UnauthorizedException);
  });

  it('rejects a malformed token', () => {
    expect(() => service.verify('not-a-token', 'put')).toThrow(UnauthorizedException);
    expect(() => service.verify('', 'put')).toThrow(UnauthorizedException);
  });
});
