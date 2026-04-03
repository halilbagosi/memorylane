import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const algorithm = 'aes-256-cbc';

//hash the secret key to exactly 32 bytes using SHA-256.
//guarantees that the key length is ALWAYS correct for AES-256.
const secretKey = createHash('sha256')
  .update(process.env.ENCRYPTION_KEY || 'default-secret-key-fallback-2026')
  .digest();

const ivLength = 16; // Standard for AES

export function encrypt(text: string): string {
  if (!text) return '';

  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, secretKey, iv);
  
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  try {
    if (!text || !text.includes(':')) return text;

    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    const decipher = createDecipheriv(algorithm, secretKey, iv);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    return 'Decryption Error';
  }
}