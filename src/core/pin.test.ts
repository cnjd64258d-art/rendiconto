import { describe, expect, it } from 'vitest';
import {
  blockText,
  createPinConfig,
  isValidPin,
  lockAfterLabel,
  NO_ATTEMPTS,
  readPinAttempts,
  readPinConfig,
  registerFailure,
  remainingBlockMs,
  shouldLockOnReturn,
  verifyPin,
} from './pin';

// Few iterations keep the tests fast; the app uses PIN_ITERATIONS.
const FAST = 1000;

describe('pin', () => {
  it('validates length and digits', () => {
    expect(isValidPin('1234', 4)).toBe(true);
    expect(isValidPin('123456', 6)).toBe(true);
    expect(isValidPin('123', 4)).toBe(false);
    expect(isValidPin('12a4', 4)).toBe(false);
    expect(isValidPin('1234', 6)).toBe(false);
  });

  it('stores a salted hash, never the PIN, and verifies it', async () => {
    const a = await createPinConfig('2580', 4, 60, FAST);
    const b = await createPinConfig('2580', 4, 60, FAST);
    expect(JSON.stringify(a)).not.toContain('2580');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin('2580', a)).toBe(true);
    expect(await verifyPin('2581', a)).toBe(false);
    expect(await verifyPin('258', a)).toBe(false);
  });

  it('rejects an invalid PIN on creation', async () => {
    await expect(createPinConfig('12', 4, 0, FAST)).rejects.toThrow();
  });

  it('blocks after five failures with a growing wait', () => {
    let a = NO_ATTEMPTS;
    for (let i = 0; i < 4; i++) a = registerFailure(a, 0);
    expect(a).toEqual({ failures: 4, blockedUntil: 0 });
    a = registerFailure(a, 1000);
    expect(remainingBlockMs(a, 1000)).toBe(30_000);
    a = registerFailure(a, 1000);
    expect(remainingBlockMs(a, 1000)).toBe(60_000);
    for (let i = 0; i < 10; i++) a = registerFailure(a, 0);
    expect(remainingBlockMs(a, 0)).toBe(15 * 60_000);
    expect(remainingBlockMs(a, 16 * 60_000)).toBe(0);
    expect(blockText(30_000)).toBe('Riprova tra 30 s');
    expect(blockText(90_000)).toBe('Riprova tra 2 min');
  });

  it('locks on return after the chosen delay', () => {
    expect(shouldLockOnReturn(null, 10_000, 0)).toBe(false);
    expect(shouldLockOnReturn(0, 0, 0)).toBe(true);
    expect(shouldLockOnReturn(0, 59_000, 60)).toBe(false);
    expect(shouldLockOnReturn(0, 60_000, 60)).toBe(true);
    expect(lockAfterLabel(0)).toBe('Subito');
    expect(lockAfterLabel(300)).toBe('Dopo 5 min');
  });

  it('reads stored rows defensively', () => {
    expect(readPinConfig(null)).toBeNull();
    expect(readPinConfig({ hash: 'x' })).toBeNull();
    expect(readPinConfig({ hash: 'h', salt: 's', iterations: 10 })).toEqual({ hash: 'h', salt: 's', iterations: 10, length: 4, lockAfterSec: 60 });
    expect(readPinAttempts(undefined)).toEqual(NO_ATTEMPTS);
    expect(readPinAttempts({ failures: 3 })).toEqual({ failures: 3, blockedUntil: 0 });
  });
});
