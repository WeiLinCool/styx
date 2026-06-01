const SAFE_ERROR_KEYS = ['message', 'type', 'code', 'param'] as const;
const MAX_ERROR_VALUE_LENGTH = 240;
const MAX_TEXT_ERROR_LENGTH = 500;

export async function readSafeProviderErrorBody(response: Response) {
  try {
    const body = await response.text();
    const trimmed = body.trim();
    if (!trimmed) {
      return 'empty response body';
    }

    return summarizeProviderErrorBody(trimmed);
  } catch {
    return 'response body unavailable';
  }
}

function summarizeProviderErrorBody(body: string) {
  const parsed = parseJsonObject(body);
  if (!parsed) {
    return body.slice(0, MAX_TEXT_ERROR_LENGTH);
  }

  const error = isRecord(parsed.error) ? parsed.error : parsed;
  const parts = SAFE_ERROR_KEYS.flatMap((key) => {
    const value = error[key];
    return typeof value === 'string' && value.trim()
      ? [`${key}: ${truncate(value.trim(), MAX_ERROR_VALUE_LENGTH)}`]
      : [];
  });

  return parts.length > 0
    ? parts.join(' · ')
    : `response body redacted (${body.length} chars)`;
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
