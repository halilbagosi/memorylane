import { encrypt, decrypt, decryptWithMeta } from './encryption.util';

describe('encryption.util key rotation', () => {
  const oldKeyBackup = process.env.ENCRYPTION_KEY;
  const legacy1Backup = process.env.ENCRYPTION_KEY_LEGACY_1;

  afterEach(() => {
    process.env.ENCRYPTION_KEY = oldKeyBackup;
    process.env.ENCRYPTION_KEY_LEGACY_1 = legacy1Backup;
  });

  it('encrypts with primary and decrypts with same ENCRYPTION_KEY', () => {
    process.env.ENCRYPTION_KEY = 'primary-key-unit-test-alpha';
    delete process.env.ENCRYPTION_KEY_LEGACY_1;
    const ct = encrypt('Alice');
    expect(decrypt(ct)).toBe('Alice');
    const m = decryptWithMeta(ct);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.keyIndex).toBe(0);
  });

  it('decrypts ciphertext from an old ENCRYPTION_KEY when that key is listed as legacy', () => {
    process.env.ENCRYPTION_KEY = 'old-primary-for-ciphertext';
    delete process.env.ENCRYPTION_KEY_LEGACY_1;
    const ciphertext = encrypt('Bob');

    process.env.ENCRYPTION_KEY = 'brand-new-primary';
    process.env.ENCRYPTION_KEY_LEGACY_1 = 'old-primary-for-ciphertext';

    expect(decrypt(ciphertext)).toBe('Bob');
    const m = decryptWithMeta(ciphertext);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.plaintext).toBe('Bob');
      expect(m.keyIndex).toBeGreaterThanOrEqual(1);
    }
  });
});
