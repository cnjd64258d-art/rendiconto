import { ES256, fromBase64Url, randomBytes, toBase64Url, verifyAssertion, type BiometricConfig } from '../core/biometric';

/*
 * WebAuthn glue for Face ID / Touch ID. iOS only shows Face ID inside a tap, so both functions must be
 * called synchronously from the tap handler (no await before them). No network: the passkey stays in the
 * iPhone's keychain and the signature is checked here (core/biometric.ts).
 */

export type BiometricResult = 'ok' | 'cancelled' | 'failed' | 'unsupported';

export async function biometricAvailable(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

function cancelled(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError');
}

/** Creates the passkey "Ledgerline" on this iPhone. Returns null when cancelled or unsupported. */
export async function registerBiometric(): Promise<BiometricConfig | null> {
  if (typeof navigator.credentials?.create !== 'function') return null;
  const rpId = location.hostname;
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Ledgerline', id: rpId },
        user: { id: randomBytes(16), name: 'Ledgerline', displayName: 'Ledgerline' },
        challenge: randomBytes(32),
        pubKeyCredParams: [{ type: 'public-key', alg: ES256 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        attestation: 'none',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const response = credential?.response as AuthenticatorAttestationResponse | undefined;
    const spki = response?.getPublicKey?.();
    if (!credential || !spki || response?.getPublicKeyAlgorithm?.() !== ES256) return null;
    return { credentialId: toBase64Url(new Uint8Array(credential.rawId)), publicKey: toBase64Url(new Uint8Array(spki)), rpId };
  } catch {
    return null;
  }
}

/** Asks for Face ID and verifies the signature locally. */
export async function unlockWithBiometric(config: BiometricConfig): Promise<BiometricResult> {
  if (typeof navigator.credentials?.get !== 'function') return 'unsupported';
  const challenge = randomBytes(32);
  try {
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: config.rpId,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(config.credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const response = credential?.response as AuthenticatorAssertionResponse | undefined;
    if (!response) return 'failed';
    const ok = await verifyAssertion(
      config,
      {
        clientDataJSON: new Uint8Array(response.clientDataJSON),
        authenticatorData: new Uint8Array(response.authenticatorData),
        signature: new Uint8Array(response.signature),
      },
      challenge,
      location.origin,
    );
    return ok ? 'ok' : 'failed';
  } catch (e) {
    return cancelled(e) ? 'cancelled' : 'failed';
  }
}
