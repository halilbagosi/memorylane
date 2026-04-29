import { randomBytes } from 'crypto';
import { MediaCryptoService } from './media-crypto.service';

describe('MediaCryptoService', () => {
  const service = new MediaCryptoService();

  it('encrypts and decrypts arbitrary payloads', () => {
    const dek = randomBytes(32);
    const iv = service.generatePayloadIv();
    const plaintext = Buffer.from('hello secure world', 'utf8');
    const { ciphertext, tag } = service.encryptPayload(plaintext, dek, iv);
    expect(ciphertext.equals(plaintext)).toBe(false);
    const decrypted = service.decryptPayload(ciphertext, dek, iv, tag);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('fails decryption when the GCM tag is wrong', () => {
    const dek = randomBytes(32);
    const iv = service.generatePayloadIv();
    const plaintext = Buffer.from('payload');
    const { ciphertext, tag } = service.encryptPayload(plaintext, dek, iv);
    const badTag = Buffer.from(tag);
    badTag[0] ^= 0xff;
    expect(() => service.decryptPayload(ciphertext, dek, iv, badTag)).toThrow();
  });

  it('fails decryption with the wrong DEK', () => {
    const dek = randomBytes(32);
    const otherDek = randomBytes(32);
    const iv = service.generatePayloadIv();
    const plaintext = Buffer.from('payload');
    const { ciphertext, tag } = service.encryptPayload(plaintext, dek, iv);
    expect(() => service.decryptPayload(ciphertext, otherDek, iv, tag)).toThrow();
  });
});
