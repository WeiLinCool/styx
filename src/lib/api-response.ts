import { decryptResponseBody, isEncryptedResponseEnvelope } from '@/lib/request-encryption';

export async function readJsonResponse<T = any>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (isEncryptedResponseEnvelope(parsed)) {
      const decrypted = await decryptResponseBody(parsed);
      if (!decrypted?.trim()) {
        return null;
      }

      return JSON.parse(decrypted) as T;
    }

    return parsed as T;
  } catch {
    return null;
  }
}
