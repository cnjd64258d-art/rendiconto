import { describe, expect, it } from 'vitest';
import { derToRaw, fromBase64Url, readBiometricConfig, toBase64Url, verifyAssertion, type Assertion, type BiometricConfig } from './biometric';

const ORIGIN = 'https://example.github.io';
const RP = 'example.github.io';

/** 64-byte r||s → DER, like an authenticator returns it. */
function rawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if ((v[0] ?? 0) & 0x80) v = Uint8Array.from([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return Uint8Array.from([0x30, body.length, ...body]);
}

async function setup() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const config: BiometricConfig = { credentialId: 'abc', publicKey: toBase64Url(spki), rpId: RP };
  const sign = async (opts: { challenge: Uint8Array; flags?: number; origin?: string; rp?: string; type?: string }): Promise<Assertion> => {
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: opts.type ?? 'webauthn.get', challenge: toBase64Url(opts.challenge), origin: opts.origin ?? ORIGIN }),
    );
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(opts.rp ?? RP)));
    const authenticatorData = new Uint8Array(37);
    authenticatorData.set(rpHash);
    authenticatorData[32] = opts.flags ?? 0x05;
    const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON));
    const signed = new Uint8Array([...authenticatorData, ...clientHash]);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, signed));
    return { clientDataJSON, authenticatorData, signature: rawToDer(raw) };
  };
  return { config, sign };
}

describe('biometric unlock', () => {
  it('round-trips base64url and DER signatures', () => {
    const bytes = Uint8Array.from([251, 255, 0, 1, 2]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    const raw = new Uint8Array(64).map((_, i) => (i === 0 || i === 32 ? 0x80 : i));
    expect(derToRaw(rawToDer(raw))).toEqual(raw);
    expect(derToRaw(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it('accepts a fresh, user-verified signature by the stored key', async () => {
    const { config, sign } = await setup();
    const challenge = Uint8Array.from([1, 2, 3, 4]);
    expect(await verifyAssertion(config, await sign({ challenge }), challenge, ORIGIN)).toBe(true);
  });

  it('rejects a wrong challenge, origin, site, missing Face ID check or another key', async () => {
    const { config, sign } = await setup();
    const other = await setup();
    const challenge = Uint8Array.from([9, 9, 9]);
    expect(await verifyAssertion(config, await sign({ challenge }), Uint8Array.from([1]), ORIGIN)).toBe(false);
    expect(await verifyAssertion(config, await sign({ challenge, origin: 'https://evil.example' }), challenge, ORIGIN)).toBe(false);
    expect(await verifyAssertion(config, await sign({ challenge, rp: 'evil.example' }), challenge, ORIGIN)).toBe(false);
    expect(await verifyAssertion(config, await sign({ challenge, flags: 0x01 }), challenge, ORIGIN)).toBe(false);
    expect(await verifyAssertion(config, await sign({ challenge, type: 'webauthn.create' }), challenge, ORIGIN)).toBe(false);
    expect(await verifyAssertion(config, await other.sign({ challenge }), challenge, ORIGIN)).toBe(false);
    const tampered = await sign({ challenge });
    tampered.authenticatorData[33] = 1;
    expect(await verifyAssertion(config, tampered, challenge, ORIGIN)).toBe(false);
  });

  it('reads stored rows defensively', () => {
    expect(readBiometricConfig(null)).toBeNull();
    expect(readBiometricConfig({ credentialId: 'a' })).toBeNull();
    expect(readBiometricConfig({ credentialId: 'a', publicKey: 'b', rpId: 'c' })).toEqual({ credentialId: 'a', publicKey: 'b', rpId: 'c' });
  });
});
