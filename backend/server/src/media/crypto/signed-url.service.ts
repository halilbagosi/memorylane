import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export type SignedUrlOp = 'put' | 'get';

interface TokenClaims {
  pid: string;
  op: SignedUrlOp;
  exp: number;
  ver: 1;
}

const CLAIM_VERSION = 1;

/**
 * Issues and verifies short-lived HMAC-signed tokens that grant access
 * to a single media object for a single operation. The token only
 * references the media's pseudonymous public id; it never carries
 * caregiver, patient, or storage key information.
 */
@Injectable()
export class SignedUrlService implements OnModuleInit {
  private readonly logger = new Logger(SignedUrlService.name);
  private secret!: Buffer;

  onModuleInit() {
    const raw = process.env.MEDIA_SIGNED_URL_SECRET || process.env.JWT_SECRET;
    if (!raw) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MEDIA_SIGNED_URL_SECRET (or JWT_SECRET) must be set in production');
      }
      this.logger.warn('MEDIA_SIGNED_URL_SECRET is not set; using ephemeral secret.');
      this.secret = randomBytes(32);
      return;
    }
    this.secret = Buffer.from(raw, 'utf8');
  }

  issue(publicId: string, op: SignedUrlOp, ttlSeconds: number): { token: string; expiresAt: Date } {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const claims: TokenClaims = { pid: publicId, op, exp, ver: CLAIM_VERSION };
    const payload = this.b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
    const sig = this.b64url(this.hmac(payload));
    return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000) };
  }

  verify(token: string, expectedOp: SignedUrlOp): TokenClaims {
    if (typeof token !== 'string' || !token.includes('.')) {
      throw new UnauthorizedException('Invalid signed URL');
    }
    const [payload, sig] = token.split('.');
    const expected = this.b64url(this.hmac(payload));
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid signed URL');
    }
    let claims: TokenClaims;
    try {
      claims = JSON.parse(this.b64urlDecode(payload).toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid signed URL');
    }
    if (claims.ver !== CLAIM_VERSION) {
      throw new UnauthorizedException('Unsupported signed URL version');
    }
    if (claims.op !== expectedOp) {
      throw new UnauthorizedException('Signed URL op mismatch');
    }
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Signed URL expired');
    }
    if (typeof claims.pid !== 'string' || claims.pid.length === 0) {
      throw new UnauthorizedException('Invalid signed URL');
    }
    return claims;
  }

  private hmac(payload: string): Buffer {
    return createHmac('sha256', this.secret).update(payload).digest();
  }

  private b64url(buf: Buffer): string {
    return buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  private b64urlDecode(s: string): Buffer {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    return Buffer.from(padded + '='.repeat(padLen), 'base64');
  }
}
