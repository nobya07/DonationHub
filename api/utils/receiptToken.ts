import { createHmac } from 'crypto';

/**
 * Secure receipt tokens for public receipt links.
 *
 * Receipt numbers (DH-000034) are sequential and guessable, so they are
 * never used directly in public URLs. A token is an HMAC-SHA256 of the
 * receipt number keyed with a server-only secret, truncated to 128 bits of
 * hex. Tokens are deterministic (same receipt => same token), unpredictable
 * without the secret, and identify exactly one receipt. Nothing extra is
 * stored: the server recomputes the HMAC for each row when looking a token
 * up, so no schema or data changes are needed.
 */

const TOKEN_HEX_LENGTH = 32;

export function getReceiptTokenSecret(): string {
  const secret =
    process.env.RECEIPT_TOKEN_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'RECEIPT_TOKEN_SECRET or JWT_SECRET environment variable is not set',
    );
  }

  return secret;
}

/** Deterministic 128-bit hex token for a receipt number. */
export function createReceiptToken(receiptNo: string): string {
  return createHmac('sha256', getReceiptTokenSecret())
    .update(receiptNo)
    .digest('hex')
    .slice(0, TOKEN_HEX_LENGTH);
}

/** True when the value has the exact shape of a receipt token. */
export function isReceiptToken(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${TOKEN_HEX_LENGTH}}$`).test(value);
}
