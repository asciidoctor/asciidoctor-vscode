/**
 * Generate a Content Security Policy nonce: 128 random bits, as recommended by
 * the specification. Relies on the Web Crypto API, available on both the desktop
 * and the web clients.
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}
