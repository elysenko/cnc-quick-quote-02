import { randomBytes } from 'node:crypto';

/** Crockford-ish alphabet: no I/O/0/1, so a number read aloud is unambiguous. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function token(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Human-quotable quote reference, e.g. "Q-4K2P9M". */
export const quoteReference = (): string => `Q-${token(6)}`;

/** Sequential-looking order number scoped by year, e.g. "ORD-2026-8FQ2T1". */
export const orderNumber = (now: Date): string => `ORD-${now.getUTCFullYear()}-${token(6)}`;

/** Support-desk confirmation number, e.g. "CNF-7QK4-2M9X". */
export const confirmationNumber = (): string => `CNF-${token(4)}-${token(4)}`;
