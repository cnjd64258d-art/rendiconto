/**
 * Face ID / Touch ID unlock through a WebAuthn platform credential (a passkey on this iPhone).
 * Everything is checked locally: the app keeps the credential's public key and verifies each
 * assertion's signature, challenge, origin, RP id and the "user verified" flag. Like the PIN
 * (decision 6) it locks the app, it does not encrypt the data.
 */

export interface BiometricConfig {
  /** base64url credential id. */
  credentialId: string;
  /** base64url SubjectPublicKeyInfo of the P-256 key (COSE alg -7, ES256). */
  publicKey: string;
  rpId: string;
}

export interface Assertion {
  clientDataJSON: Uint8Array<ArrayBuffer>;
  authenticatorData: Uint8Array<ArrayBuffer>;
  /** DER-encoded ECDSA signature, as WebAuthn returns it. */
  signature: Uint8Array<ArrayBuffer>;
}

export { META_BIOMETRIC_LOCK as META_BIOMETRIC } from './pin';
export const ES256 = -7;

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** ECDSA DER (SEQUENCE of two INTEGERs) → 64-byte r||s, the format Web Crypto verifies. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (der[0] !== 0x30) return null;
  let i = 2;
  if ((der[1] ?? 0) & 0x80) i = 2 + ((der[1] ?? 0) & 0x7f);
  const out = new Uint8Array(64);
  for (const offset of [0, 32]) {
    if (der[i] !== 0x02) return null;
    const len = der[i + 1] ?? 0;
    let int = der.slice(i + 2, i + 2 + len);
    while (int.length > 32 && int[0] === 0) int = int.slice(1);
    if (int.length > 32) return null;
    out.set(int, offset + 32 - int.length);
    i += 2 + len;
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** True only for a fresh, user-verified signature by the stored key, for this site and this challenge. */
export async function verifyAssertion(config: BiometricConfig, assertion: Assertion, challenge: Uint8Array, origin: string): Promise<boolean> {
  try {
    const client = JSON.parse(new TextDecoder().decode(assertion.clientDataJSON)) as { type?: string; challenge?: string; origin?: string };
    if (client.type !== 'webauthn.get' || client.origin !== origin || client.challenge !== toBase64Url(challenge)) return false;

    const auth = assertion.authenticatorData;
    if (auth.length < 37) return false;
    const rpHash = await sha256(new TextEncoder().encode(config.rpId));
    if (!sameBytes(auth.slice(0, 32), rpHash)) return false;
    const flags = auth[32] ?? 0;
    if (!(flags & FLAG_USER_PRESENT) || !(flags & FLAG_USER_VERIFIED)) return false;

    const raw = derToRaw(assertion.signature);
    if (!raw) return false;
    const key = await crypto.subtle.importKey('spki', fromBase64Url(config.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const clientHash = await sha256(assertion.clientDataJSON);
    const signed = new Uint8Array(auth.length + clientHash.length);
    signed.set(auth);
    signed.set(clientHash, auth.length);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, signed);
  } catch {
    return false;
  }
}

export function readBiometricConfig(value: unknown): BiometricConfig | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<BiometricConfig>;
  if (typeof v.credentialId !== 'string' || typeof v.publicKey !== 'string' || typeof v.rpId !== 'string') return null;
  return { credentialId: v.credentialId, publicKey: v.publicKey, rpId: v.rpId };
}
