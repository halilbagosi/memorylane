import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';

const algorithm = 'aes-256-cbc';
const DEV_FALLBACK = 'default-secret-key-fallback-2026';

const ivLength = 16;

/** Hash any UTF-8 string to a 32-byte AES key. */
export function deriveKeyMaterial(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

/** Ordered key chain: [current PRIMARY, legacy1, legacy2, ...]. Decryption tries each until one succeeds. */
function getEncryptionKeyChain(): Buffer[] {
  const chain: Buffer[] = [];

  // Primary: same rule as before — ENCRYPTION_KEY or dev fallback (keep existing ciphertext readable in dev)
  const primarySecret = process.env.ENCRYPTION_KEY || DEV_FALLBACK;
  chain.push(deriveKeyMaterial(primarySecret));

  const triplePipe = process.env.ENCRYPTION_KEY_LEGACY_PIPE;
  if (triplePipe && triplePipe.trim().length > 0) {
    triplePipe
      .split(/\|\|\|/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => chain.push(deriveKeyMaterial(s)));
  }

  for (let i = 1; i <= 12; i++) {
    const v = process.env[`ENCRYPTION_KEY_LEGACY_${i}` as `ENCRYPTION_KEY_LEGACY_${number}`];
    if (v && typeof v === 'string' && v.trim().length > 0) {
      chain.push(deriveKeyMaterial(v.trim()));
    }
  }

  const seen = new Set<string>();
  return chain.filter((buf) => {
    const hex = buf.toString('hex');
    if (seen.has(hex)) return false;
    seen.add(hex);
    return true;
  });
}

export type DecryptFieldResult =
  | { ok: true; plaintext: string; keyIndex: number }
  | { ok: false };

/**
 * Decrypt a single field, trying the primary key first, then each legacy key.
 * `keyIndex` 0 = primary; &gt;0 means a legacy key matched (candidate for re-encryption).
 */
export function decryptWithMeta(ciphertext: string): DecryptFieldResult {
  if (!ciphertext || !ciphertext.includes(':')) {
    return { ok: true, plaintext: ciphertext, keyIndex: 0 };
  }

  const textParts = ciphertext.split(':');
  const ivHex = textParts.shift();
  if (!ivHex) return { ok: false };
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');

  const keys = getEncryptionKeyChain();
  for (let i = 0; i < keys.length; i++) {
    try {
      const decipher = createDecipheriv(algorithm, keys[i], iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return { ok: true, plaintext: decrypted.toString('utf8'), keyIndex: i };
    } catch {
      continue;
    }
  }
  return { ok: false };
}

export function encrypt(text: string): string {
  if (!text) return '';

  const iv = randomBytes(ivLength);
  const chain = getEncryptionKeyChain();
  const primaryKey = chain[0];
  const cipher = createCipheriv(algorithm, primaryKey, iv);

  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/** Backward-compatible: decrypt using full key chain. */
export function decrypt(text: string): string {
  const r = decryptWithMeta(text);
  if (!r.ok) return 'Decryption Error';
  return r.plaintext;
}

type MinimalPatientUpdater = Pick<PrismaClient, 'patient'>;

/**
 * After decrypting with a legacy key, re-encrypt both fields using the primary key so future reads use ENCRYPTION_KEY only.
 * Fire-and-forget safe: callers always get display strings even if migrate fails.
 */
export async function decryptPatientNamesWithOptionalReencrypt(
  prisma: MinimalPatientUpdater,
  row: { id: string; name: string; surname: string },
): Promise<{ name: string; surname: string }> {
  const n = decryptWithMeta(row.name);
  const s = decryptWithMeta(row.surname);

  const name = n.ok ? n.plaintext : 'Decryption Error';
  const surname = s.ok ? s.plaintext : 'Decryption Error';

  const needsMigrate =
    n.ok && s.ok && (n.keyIndex !== 0 || s.keyIndex !== 0);

  if (needsMigrate) {
    try {
      await prisma.patient.update({
        where: { id: row.id },
        data: {
          name: encrypt(n.plaintext),
          surname: encrypt(s.plaintext),
        },
      });
    } catch {
      /* best-effort migrate */
    }
  }

  return { name, surname };
}
