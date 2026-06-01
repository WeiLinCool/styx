import { and, eq } from 'drizzle-orm';

import { db, schema } from '@/server/db';

export type RequestIdempotencyActorType = 'anonymous' | 'user' | 'admin';
export type RequestIdempotencyStatus = 'processing' | 'completed' | 'failed';

export type IdempotentResponseSummary = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export type RequestIdempotencyScope = {
  actorType: RequestIdempotencyActorType;
  actorId: string | null;
  operation: string;
  key: string;
  bodyHash: string;
  ttlMs?: number;
  now?: () => Date;
};

export type RequestIdempotencyRecord = RequestIdempotencyScope & {
  status: RequestIdempotencyStatus;
  responseSummary: IdempotentResponseSummary | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export type RequestIdempotencyStore = {
  begin(input: RequestIdempotencyScope): Promise<RequestIdempotencyRecord>;
  complete(input: RequestIdempotencyScope, response: IdempotentResponseSummary): Promise<RequestIdempotencyRecord>;
  fail(input: RequestIdempotencyScope, response?: IdempotentResponseSummary | null): Promise<RequestIdempotencyRecord>;
};

export type RunIdempotentRequestResult = {
  replayed: boolean;
  response: IdempotentResponseSummary;
};

export class RequestIdempotencyError extends Error {
  constructor(
    public readonly code:
      | 'idempotency_key_required'
      | 'idempotency_key_reused_with_different_body'
      | 'idempotency_request_processing',
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RequestIdempotencyError';
  }
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_MEMORY_RECORDS = 500;
const FALLBACK_ERROR_CODES = new Set(['42P01']);

export function createMemoryRequestIdempotencyStore(options: { maxRecords?: number } = {}) {
  const records = new Map<string, RequestIdempotencyRecord>();
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_MEMORY_RECORDS;

  function scopeKey(input: RequestIdempotencyScope) {
    return [
      input.actorType,
      normalizeActorId(input.actorId),
      input.operation,
      input.key,
    ].join('\u001f');
  }

  function prune(now: Date) {
    for (const [key, record] of records) {
      if (record.expiresAt <= now) {
        records.delete(key);
      }
    }

    while (records.size > maxRecords) {
      const oldest = records.keys().next().value as string | undefined;
      if (!oldest) {
        return;
      }
      records.delete(oldest);
    }
  }

  async function begin(input: RequestIdempotencyScope) {
    const now = input.now?.() ?? new Date();
    prune(now);
    const key = scopeKey(input);
    const existing = records.get(key);
    if (existing) {
      assertCompatibleBody(existing, input);
      if (existing.status === 'completed' && existing.responseSummary) {
        return existing;
      }
      throw new RequestIdempotencyError(
        'idempotency_request_processing',
        409,
        'idempotency_request_processing',
      );
    }

    const record: RequestIdempotencyRecord = {
      ...input,
      ttlMs: input.ttlMs,
      status: 'processing',
      responseSummary: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)),
    };
    records.set(key, record);
    prune(now);
    return record;
  }

  async function complete(
    input: RequestIdempotencyScope,
    response: IdempotentResponseSummary,
  ) {
    const now = input.now?.() ?? new Date();
    const key = scopeKey(input);
    const existing = records.get(key);
    if (!existing) {
      throw new RequestIdempotencyError(
        'idempotency_key_required',
        400,
        'idempotency_key_required',
      );
    }
    assertCompatibleBody(existing, input);

    const updatedRecord = {
      ...existing,
      status: 'completed' as const,
      responseSummary: response,
      updatedAt: now,
    };
    records.set(key, updatedRecord);
    prune(now);
    return updatedRecord;
  }

  async function fail(
    input: RequestIdempotencyScope,
    response: IdempotentResponseSummary | null = null,
  ) {
    const now = input.now?.() ?? new Date();
    const key = scopeKey(input);
    const existing = records.get(key);
    if (!existing) {
      throw new RequestIdempotencyError(
        'idempotency_key_required',
        400,
        'idempotency_key_required',
      );
    }
    assertCompatibleBody(existing, input);

    const updatedRecord = {
      ...existing,
      status: 'failed' as const,
      responseSummary: response,
      updatedAt: now,
    };
    records.set(key, updatedRecord);
    prune(now);
    return updatedRecord;
  }

  return {
    begin,
    complete,
    fail,
    size: () => records.size,
  };
}

export function createDatabaseRequestIdempotencyStore(): RequestIdempotencyStore | null {
  if (!db || !process.env.DATABASE_URL) {
    return null;
  }

  async function findRecord(input: RequestIdempotencyScope) {
    const [record] = await db!
      .select()
      .from(schema.requestIdempotencyRecords)
      .where(
        and(
          eq(schema.requestIdempotencyRecords.actorType, input.actorType),
          eq(schema.requestIdempotencyRecords.actorId, normalizeActorId(input.actorId)),
          eq(schema.requestIdempotencyRecords.operation, input.operation),
          eq(schema.requestIdempotencyRecords.key, input.key),
        ),
      )
      .limit(1);

    return record ?? null;
  }

  async function begin(input: RequestIdempotencyScope) {
    const now = input.now?.() ?? new Date();
    const existing = await findRecord(input);
    if (existing && existing.expiresAt > now) {
      assertCompatibleBody(existing, input);
      if (existing.status === 'completed' && existing.responseSummary) {
        return fromDbRecord(existing);
      }
      throw new RequestIdempotencyError(
        'idempotency_request_processing',
        409,
        'idempotency_request_processing',
      );
    }

    if (existing) {
      await db!
        .update(schema.requestIdempotencyRecords)
        .set({
          bodyHash: input.bodyHash,
          status: 'processing',
          responseSummary: null,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)),
        })
        .where(eq(schema.requestIdempotencyRecords.id, existing.id));
    } else {
      await db!.insert(schema.requestIdempotencyRecords).values({
        key: input.key,
        actorType: input.actorType,
        actorId: normalizeActorId(input.actorId),
        operation: input.operation,
        bodyHash: input.bodyHash,
        status: 'processing',
        responseSummary: null,
        expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)),
      });
    }

    const record = await findRecord(input);
    if (!record) {
      throw new Error('Failed to create request idempotency record.');
    }
    return fromDbRecord(record);
  }

  async function complete(
    input: RequestIdempotencyScope,
    response: IdempotentResponseSummary,
  ) {
    const now = input.now?.() ?? new Date();
    const existing = await findRecord(input);
    if (!existing) {
      throw new RequestIdempotencyError(
        'idempotency_key_required',
        400,
        'idempotency_key_required',
      );
    }
    assertCompatibleBody(existing, input);
    const [record] = await db!
      .update(schema.requestIdempotencyRecords)
      .set({
        status: 'completed',
        responseSummary: response as Record<string, unknown>,
        updatedAt: now,
      })
      .where(eq(schema.requestIdempotencyRecords.id, existing.id))
      .returning();

    return fromDbRecord(record);
  }

  async function fail(
    input: RequestIdempotencyScope,
    response: IdempotentResponseSummary | null = null,
  ) {
    const now = input.now?.() ?? new Date();
    const existing = await findRecord(input);
    if (!existing) {
      throw new RequestIdempotencyError(
        'idempotency_key_required',
        400,
        'idempotency_key_required',
      );
    }
    assertCompatibleBody(existing, input);
    const [record] = await db!
      .update(schema.requestIdempotencyRecords)
      .set({
        status: 'failed',
        responseSummary: response as Record<string, unknown> | null,
        updatedAt: now,
      })
      .where(eq(schema.requestIdempotencyRecords.id, existing.id))
      .returning();

    return fromDbRecord(record);
  }

  return { begin, complete, fail };
}

const fallbackStore = createMemoryRequestIdempotencyStore();
let resolvedStore: RequestIdempotencyStore | null = null;

export function getRequestIdempotencyStore(): RequestIdempotencyStore {
  if (resolvedStore) {
    return resolvedStore;
  }

  const dbStore = createDatabaseRequestIdempotencyStore();
  if (!dbStore) {
    resolvedStore = fallbackStore;
    return resolvedStore;
  }

  resolvedStore = wrapWithFallback(dbStore, fallbackStore);
  return resolvedStore;
}

export async function runIdempotentRequest(
  store: RequestIdempotencyStore,
  input: RequestIdempotencyScope,
  operation: () => Promise<IdempotentResponseSummary>,
): Promise<RunIdempotentRequestResult> {
  if (!input.key.trim()) {
    throw new RequestIdempotencyError(
      'idempotency_key_required',
      400,
      'idempotency_key_required',
    );
  }

  const record = await store.begin(input);
  if (record.status === 'completed' && record.responseSummary) {
    return {
      replayed: true,
      response: record.responseSummary,
    };
  }

  try {
    const response = await operation();
    await store.complete(input, response);
    return {
      replayed: false,
      response,
    };
  } catch (error) {
    await store.fail(input).catch(() => undefined);
    throw error;
  }
}

export function idempotencyErrorToResponse(error: unknown) {
  if (!(error instanceof RequestIdempotencyError)) {
    return null;
  }

  return {
    status: error.status,
    body: {
      error: {
        code: error.code,
        message: error.message,
      },
    },
  };
}

function assertCompatibleBody(
  record: Pick<RequestIdempotencyRecord, 'bodyHash'>,
  input: RequestIdempotencyScope,
) {
  if (record.bodyHash !== input.bodyHash) {
    throw new RequestIdempotencyError(
      'idempotency_key_reused_with_different_body',
      409,
      'idempotency_key_reused_with_different_body',
    );
  }
}

function normalizeActorId(actorId: string | null) {
  return actorId ?? '__anonymous__';
}

function fromDbRecord(record: typeof schema.requestIdempotencyRecords.$inferSelect): RequestIdempotencyRecord {
  return {
    actorType: record.actorType,
    actorId: record.actorId,
    operation: record.operation,
    key: record.key,
    bodyHash: record.bodyHash,
    status: record.status,
    responseSummary: normalizeResponseSummary(record.responseSummary),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  };
}

function normalizeResponseSummary(
  value: Record<string, unknown> | null,
): IdempotentResponseSummary | null {
  if (!value || typeof value.status !== 'number') {
    return null;
  }

  return {
    status: value.status,
    body: value.body,
    headers: isHeaderRecord(value.headers) ? value.headers : undefined,
  };
}

function isHeaderRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function wrapWithFallback(
  primary: RequestIdempotencyStore,
  fallback: RequestIdempotencyStore,
): RequestIdempotencyStore {
  return {
    async begin(input) {
      try {
        return await primary.begin(input);
      } catch (error) {
        if (isMissingRelationError(error)) {
          resolvedStore = fallback;
          return fallback.begin(input);
        }
        throw error;
      }
    },
    async complete(input, response) {
      try {
        return await primary.complete(input, response);
      } catch (error) {
        if (isMissingRelationError(error)) {
          resolvedStore = fallback;
          return fallback.complete(input, response);
        }
        throw error;
      }
    },
    async fail(input, response = null) {
      try {
        return await primary.fail(input, response);
      } catch (error) {
        if (isMissingRelationError(error)) {
          resolvedStore = fallback;
          return fallback.fail(input, response);
        }
        throw error;
      }
    },
  };
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42P01'
  );
}
