import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Performs AES-256-GCM encryption / decryption of the media payload itself
 * using a per-file Data Encryption Key (DEK). The DEK is provided by the
 * caller and is unwrapped via {@link KeyWrapService} before use.
 */
@Injectable()
export class MediaCryptoService {
  generatePayloadIv(): Buffer {
    return randomBytes(IV_BYTES);
  }

  encryptPayload(plaintext: Buffer, dek: Buffer, iv: Buffer): { ciphertext: Buffer; tag: Buffer } {
    const cipher = createCipheriv(ALGORITHM, dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext, tag };
  }

  decryptPayload(ciphertext: Buffer, dek: Buffer, iv: Buffer, tag: Buffer): Buffer {
    const decipher = createDecipheriv(ALGORITHM, dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
