import { KeyWrapService } from './key-wrap.service';

describe('KeyWrapService', () => {
  let service: KeyWrapService;

  beforeEach(() => {
    process.env.MEDIA_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service = new KeyWrapService();
    service.onModuleInit();
  });

  it('wraps and unwraps a DEK to its original bytes', () => {
    const dek = service.generateDek();
    const wrapped = service.wrapDek(dek);
    const unwrapped = service.unwrapDek({
      wrappedDek: wrapped.wrappedDek,
      dekIv: wrapped.dekIv,
      dekTag: wrapped.dekTag,
    });
    expect(unwrapped.equals(dek)).toBe(true);
    expect(wrapped.algorithm).toBe('AES-256-GCM');
    expect(wrapped.keyVersion).toBe('v1');
  });

  it('rejects a tampered ciphertext', () => {
    const dek = service.generateDek();
    const wrapped = service.wrapDek(dek);
    const flipped = Buffer.from(wrapped.wrappedDek, 'base64');
    flipped[0] ^= 0x01;
    expect(() =>
      service.unwrapDek({
        wrappedDek: flipped.toString('base64'),
        dekIv: wrapped.dekIv,
        dekTag: wrapped.dekTag,
      }),
    ).toThrow();
  });

  it('rejects a wrong auth tag', () => {
    const dek = service.generateDek();
    const wrapped = service.wrapDek(dek);
    const tag = Buffer.from(wrapped.dekTag, 'base64');
    tag[0] ^= 0xff;
    expect(() =>
      service.unwrapDek({
        wrappedDek: wrapped.wrappedDek,
        dekIv: wrapped.dekIv,
        dekTag: tag.toString('base64'),
      }),
    ).toThrow();
  });

  it('produces unique IVs for repeated wraps', () => {
    const dek = service.generateDek();
    const a = service.wrapDek(dek);
    const b = service.wrapDek(dek);
    expect(a.dekIv).not.toBe(b.dekIv);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });
});
