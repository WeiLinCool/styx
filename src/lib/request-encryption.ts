const REQUEST_ENCRYPTION_PASSPHRASE = 'styx-request-encryption-v1';
const RESPONSE_ENCRYPTION_PASSPHRASE = 'styx-response-encryption-v1';

export type EncryptedPayloadEnvelope = {
  encrypted: true;
  v: 1;
  iv: string;
  ciphertext: string;
};

export type EncryptedRequestEnvelope = EncryptedPayloadEnvelope;
export type EncryptedResponseEnvelope = EncryptedPayloadEnvelope;

export function isEncryptedRequestEnvelope(value: unknown): value is EncryptedRequestEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.encrypted === true &&
    candidate.v === 1 &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ciphertext === 'string'
  );
}

export function isEncryptedResponseEnvelope(value: unknown): value is EncryptedResponseEnvelope {
  return isEncryptedRequestEnvelope(value);
}

export async function encryptRequestBody(plaintext: string, passphrase = REQUEST_ENCRYPTION_PASSPHRASE) {
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
  passphrase = REQUEST_ENCRYPTION_PASSPHRASE,
): Promise<string | null> {
  try {
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
