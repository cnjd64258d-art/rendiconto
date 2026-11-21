/**
 * App-open lock (decision 6): the PIN is stored as a salted PBKDF2 hash. It locks the app, it does not
 * encrypt the data. Web Crypto is available in Safari and in Node, so this stays pure and testable.
 */

export type PinLength = 4 | 6;

export interface PinConfig {
  hash: string;
  salt: string;
  iterations: number;
  length: PinLength;
  /** Lock again when the app was in the background at least this long. 0 = right away. */
  lockAfterSec: number;
}

export interface PinAttempts {
  failures: number;
  /** Epoch ms until which new attempts are refused. */
  blockedUntil: number;
}

export const PIN_ITERATIONS = 210_000;
export const LOCK_AFTER_OPTIONS = [0, 60, 300, 900] as const;
export const DEFAULT_LOCK_AFTER = 60;
/** Meta keys that stay on this iPhone: never exported in a backup, kept on restore. */
export const META_PIN = 'pinLock';
export const META_PIN_ATTEMPTS = 'pinAttempts';
export const DEVICE_META_KEYS: readonly string[] = [META_PIN, META_PIN_ATTEMPTS];

export const NO_ATTEMPTS: PinAttempts = { failures: 0, blockedUntil: 0 };
const FREE_FAILURES = 5;
const FIRST_BLOCK_MS = 30_000;
const MAX_BLOCK_MS = 15 * 60_000;

export function isValidPin(pin: string, length: PinLength): boolean {
  return pin.length === length && /^\d+$/.test(pin);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function hashPin(pin: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations }, key, 256);
  return toBase64(new Uint8Array(bits));
}

export async function createPinConfig(
  pin: string,
  length: PinLength,
  lockAfterSec: number,
  iterations: number = PIN_ITERATIONS,
): Promise<PinConfig> {
  if (!isValidPin(pin, length)) throw new Error('PIN non valido');
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  return { hash: await hashPin(pin, salt, iterations), salt, iterations, length, lockAfterSec };
}

/** Compares in constant time, so the check does not leak how many characters match. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, config: PinConfig): Promise<boolean> {
  if (!isValidPin(pin, config.length)) return false;
  return sameText(await hashPin(pin, config.salt, config.iterations), config.hash);
}

/** After 5 wrong PINs each new mistake blocks for 30 s, then 60 s, 2 min… up to 15 min. */
export function registerFailure(a: PinAttempts, now: number): PinAttempts {
  const failures = a.failures + 1;
  if (failures < FREE_FAILURES) return { failures, blockedUntil: 0 };
  const ms = Math.min(MAX_BLOCK_MS, FIRST_BLOCK_MS * 2 ** (failures - FREE_FAILURES));
  return { failures, blockedUntil: now + ms };
}

export function remainingBlockMs(a: PinAttempts, now: number): number {
  return Math.max(0, a.blockedUntil - now);
}

/** "Riprova tra 30 s" / "Riprova tra 2 min". */
export function blockText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `Riprova tra ${s} s` : `Riprova tra ${Math.ceil(s / 60)} min`;
}

export function shouldLockOnReturn(hiddenAt: number | null, now: number, lockAfterSec: number): boolean {
  if (hiddenAt === null) return false;
  return now - hiddenAt >= lockAfterSec * 1000;
}

export function lockAfterLabel(sec: number): string {
  if (sec === 0) return 'Subito';
  return sec < 3600 ? `Dopo ${sec / 60} min` : `Dopo ${sec / 3600} h`;
}

/** Reads a stored config defensively (old or hand-edited rows). */
export function readPinConfig(value: unknown): PinConfig | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PinConfig>;
  if (typeof v.hash !== 'string' || typeof v.salt !== 'string' || typeof v.iterations !== 'number') return null;
  const length: PinLength = v.length === 6 ? 6 : 4;
  const lockAfterSec = typeof v.lockAfterSec === 'number' && v.lockAfterSec >= 0 ? v.lockAfterSec : DEFAULT_LOCK_AFTER;
  return { hash: v.hash, salt: v.salt, iterations: v.iterations, length, lockAfterSec };
}

export function readPinAttempts(value: unknown): PinAttempts {
  if (!value || typeof value !== 'object') return NO_ATTEMPTS;
  const v = value as Partial<PinAttempts>;
  return {
    failures: typeof v.failures === 'number' ? v.failures : 0,
    blockedUntil: typeof v.blockedUntil === 'number' ? v.blockedUntil : 0,
  };
}
