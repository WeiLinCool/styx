import sodium from 'libsodium-wrappers-sumo';

const REQUEST_ENCRYPTION_PASSPHRASE = 'styx-request-encryption-v1';
const RESPONSE_ENCRYPTION_PASSPHRASE = 'styx-response-encryption-v1';
export const REQUEST_ENCRYPTION_ALGORITHM_V2 = 'x25519-xsalsa20poly1305-sealedbox';

export type RequestEncryptionKeyConfig = {
  keyId: string;
  publicKeyB64Url?: string;
  privateKeyB64Url?: string;
};

export type EncryptedPayloadEnvelope = {
  encrypted: true;
  v: 1;
  iv: string;
  ciphertext: string;
};

export type SealedBoxRequestEnvelope = {
  encrypted: true;
  v: 2;
  alg: typeof REQUEST_ENCRYPTION_ALGORITHM_V2;
  kid: string;
  ciphertext: string;
};

export type EncryptedRequestEnvelope = EncryptedPayloadEnvelope | SealedBoxRequestEnvelope;
export type EncryptedResponseEnvelope = EncryptedPayloadEnvelope;

export function isEncryptedRequestEnvelope(value: unknown): value is EncryptedRequestEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const isLegacyEnvelope =
    candidate.encrypted === true &&
    candidate.v === 1 &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ciphertext === 'string';
  const isSealedBoxEnvelope =
    candidate.encrypted === true &&
    candidate.v === 2 &&
    candidate.alg === REQUEST_ENCRYPTION_ALGORITHM_V2 &&
    typeof candidate.kid === 'string' &&
    typeof candidate.ciphertext === 'string';

  return isLegacyEnvelope || isSealedBoxEnvelope;
}

export function isEncryptedResponseEnvelope(value: unknown): value is EncryptedResponseEnvelope {
  return isEncryptedRequestEnvelope(value);
}

export async function encryptRequestBody(
  plaintext: string,
  passphraseOrKeyConfig: string | RequestEncryptionKeyConfig = REQUEST_ENCRYPTION_PASSPHRASE,
) {
  if (typeof passphraseOrKeyConfig !== 'string' && passphraseOrKeyConfig.publicKeyB64Url) {
    const envelope = await encryptSealedBoxRequestBody(plaintext, passphraseOrKeyConfig);
    if (envelope) {
      return JSON.stringify(envelope);
    }
  }

  if (!hasWebCrypto()) {
    return plaintext;
  }

  const passphrase =
    typeof passphraseOrKeyConfig === 'string'
      ? passphraseOrKeyConfig
      : REQUEST_ENCRYPTION_PASSPHRASE;
  const envelope = await encryptPayload(plaintext, passphrase);
  return JSON.stringify(envelope);
}

export async function encryptResponseBody(
  body: unknown,
  passphrase = RESPONSE_ENCRYPTION_PASSPHRASE,
) {
  return encryptPayload(JSON.stringify(body), passphrase);
}

export async function decryptRequestBody(
  envelope: EncryptedRequestEnvelope,
  passphraseOrKeyConfig: string | RequestEncryptionKeyConfig = REQUEST_ENCRYPTION_PASSPHRASE,
): Promise<string | null> {
  if (envelope.v === 2) {
    return decryptSealedBoxRequestBody(envelope, passphraseOrKeyConfig);
  }

  try {
    const passphrase =
      typeof passphraseOrKeyConfig === 'string'
        ? passphraseOrKeyConfig
        : REQUEST_ENCRYPTION_PASSPHRASE;
    const key = await deriveAesKey(passphrase);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64Url(envelope.iv),
      },
      key,
      decodeBase64Url(envelope.ciphertext),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

export async function decryptResponseBody(
  envelope: EncryptedResponseEnvelope,
  passphrase = RESPONSE_ENCRYPTION_PASSPHRASE,
) {
  return decryptRequestBody(envelope, passphrase);
}

async function encryptSealedBoxRequestBody(
  plaintext: string,
  keyConfig: RequestEncryptionKeyConfig,
): Promise<SealedBoxRequestEnvelope | null> {
  if (!keyConfig.publicKeyB64Url) {
    return null;
  }

  await sodium.ready;
  const publicKey = decodeBase64Url(keyConfig.publicKeyB64Url);
  const ciphertext = sodium.crypto_box_seal(new TextEncoder().encode(plaintext), publicKey);

  return {
    encrypted: true,
    v: 2,
    alg: REQUEST_ENCRYPTION_ALGORITHM_V2,
    kid: keyConfig.keyId,
    ciphertext: encodeBase64Url(ciphertext),
  };
}

async function decryptSealedBoxRequestBody(
  envelope: SealedBoxRequestEnvelope,
  keyConfigOrPassphrase: string | RequestEncryptionKeyConfig,
): Promise<string | null> {
  if (typeof keyConfigOrPassphrase === 'string' || !keyConfigOrPassphrase.privateKeyB64Url || !keyConfigOrPassphrase.publicKeyB64Url) {
    return null;
  }

  try {
    await sodium.ready;
    const plaintext = sodium.crypto_box_seal_open(
      decodeBase64Url(envelope.ciphertext),
      decodeBase64Url(keyConfigOrPassphrase.publicKeyB64Url),
      decodeBase64Url(keyConfigOrPassphrase.privateKeyB64Url),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function encryptPayload(plaintext: string, passphrase: string) {
  const key = await deriveAesKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded),
  );

  const envelope: EncryptedPayloadEnvelope = {
    encrypted: true,
    v: 1,
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(ciphertext),
  };

  return envelope;
}

async function deriveAesKey(passphrase: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function hasWebCrypto() {
  return Boolean(globalThis.crypto?.subtle);
}

function encodeBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
