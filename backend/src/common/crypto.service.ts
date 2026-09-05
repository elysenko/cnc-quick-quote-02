import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Symmetric encryption for admin-entered third-party secrets (Stripe keys) held at
 * rest in BusinessSettings. Keyed on APP_ENCRYPTION_KEY; the key is stretched with
 * SHA-256 so any passphrase length yields a valid 32-byte AES key.
 *
 * Ciphertext format: base64(iv || authTag || ciphertext) — self-describing, so no
 * separate IV column is needed.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);

  private key(): Buffer {
    const secret =
      process.env.APP_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'cnc-quick-quote-development-key';
    return createHash('sha256').update(secret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }

  /**
   * Returns null rather than throwing when the payload cannot be decrypted — that
   * happens when APP_ENCRYPTION_KEY was rotated, and the correct product behaviour
   * is "credential unusable, ask the admin to re-enter it", not a 500.
   */
  decrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    try {
      const raw = Buffer.from(payload, 'base64');
      const iv = raw.subarray(0, IV_BYTES);
      const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const body = raw.subarray(IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv(ALGORITHM, this.key(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
      this.logger.warn(
        'Stored credential could not be decrypted (encryption key changed?). An admin must re-enter it.',
      );
      return null;
    }
  }

  /** Read-back form for a write-only secret: never the value, only its last 4 chars. */
  maskLast4(value: string | null | undefined): string {
    if (!value || value.length < 4) return '';
    return value.slice(-4);
  }
}
