import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const CURRENT_KEY_VERSION = 'v1';
const DEK_BYTES = 32;
const IV_BYTES = 12;

export interface WrappedDek {
  wrappedDek: string;
  dekIv: string;
  dekTag: string;
  algorithm: string;
  keyVersion: string;
}

/**
 * Manages the master Key Encryption Key (KEK) used to wrap per-file
 * Data Encryption Keys (DEK). The master key is loaded from
 * MEDIA_MASTER_KEY (32-byte hex preferred, otherwise SHA-256 stretched).
 *
 * In production, the absence of MEDIA_MASTER_KEY is a fatal misconfiguration;
 * in development we fall back to an ephemeral key with a loud warning so
 * encrypted files do not survive restarts.
 */
@Injectable()
export class KeyWrapService implements OnModuleInit {
  private readonly logger = new Logger(KeyWrapService.name);
  private masterKey!: Buffer;

  onModuleInit() {
    const raw = process.env.MEDIA_MASTER_KEY;
    if (!raw) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MEDIA_MASTER_KEY must be set in production');
      }
      this.logger.warn(
        'MEDIA_MASTER_KEY is not set; using ephemeral master key. Encrypted media will not survive a restart.',
      );
      this.masterKey = randomBytes(DEK_BYTES);
      return;
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      this.masterKey = Buffer.from(raw, 'hex');
    } else {
      this.masterKey = createHash('sha256').update(raw).digest();
    }
  }

  generateDek(): Buffer {
    return randomBytes(DEK_BYTES);
  }

  wrapDek(dek: Buffer): WrappedDek {
    if (dek.length !== DEK_BYTES) {
      throw new Error('Invalid DEK size');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      wrappedDek: ciphertext.toString('base64'),
      dekIv: iv.toString('base64'),
      dekTag: tag.toString('base64'),
      algorithm: 'AES-256-GCM',
      keyVersion: CURRENT_KEY_VERSION,
    };
  }

  unwrapDek(params: { wrappedDek: string; dekIv: string; dekTag: string }): Buffer {
    const iv = Buffer.from(params.dekIv, 'base64');
    const tag = Buffer.from(params.dekTag, 'base64');
    const ciphertext = Buffer.from(params.wrappedDek, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
