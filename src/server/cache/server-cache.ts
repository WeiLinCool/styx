export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  database: number;
  timeoutMs: number;
};

export type ServerCacheLock = {
  acquired: boolean;
  release: () => Promise<void>;
};

export type ServerCache = {
  getJson<T = unknown>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  consumeJson<T = unknown>(key: string): Promise<T | null>;
  acquireLock(key: string, ttlMs: number): Promise<ServerCacheLock>;
};

type MemoryCacheRecord = {
  value: unknown;
  expiresAt: number;
};

type MemoryServerCacheOptions = {
  now?: () => Date;
};

let sharedCache: ServerCache | null = null;
let sharedRedisClientPromise: Promise<RedisClientLike | null> | null = null;

type RedisClientLike = {
  connect: () => Promise<unknown>;
  isOpen?: boolean;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { PX?: number; NX?: boolean }) => Promise<string | null>;
  del: (key: string) => Promise<number>;
};

export function parseRedisConfig(env: Record<string, string | undefined>): RedisConfig | null {
  const host = env.STYX_REDIS_HOST?.trim();
  if (!host) {
    return null;
  }

  return {
    host,
    port: parsePositiveInteger(env.STYX_REDIS_PORT, 6379),
    password: env.STYX_REDIS_PASSWORD,
    database: parseNonNegativeInteger(env.STYX_REDIS_DB, 0),
    timeoutMs: parsePositiveInteger(env.STYX_REDIS_TIMEOUT_MS, 3000),
  };
}

export function createMemoryServerCache(options: MemoryServerCacheOptions = {}): ServerCache {
  const records = new Map<string, MemoryCacheRecord>();
  const now = () => options.now?.().getTime() ?? Date.now();

  function pruneKey(key: string) {
    const record = records.get(key);
    if (record && record.expiresAt <= now()) {
      records.delete(key);
      return null;
    }

    return record ?? null;
  }

  return {
    async getJson<T = unknown>(key: string) {
      return (pruneKey(key)?.value as T | undefined) ?? null;
    },
    async setJson(key: string, value: unknown, ttlMs: number) {
      records.set(key, {
        value,
        expiresAt: now() + Math.max(1, ttlMs),
      });
    },
    async delete(key: string) {
      records.delete(key);
    },
    async consumeJson<T = unknown>(key: string) {
      const value = ((await this.getJson<T>(key)) as T | null) ?? null;
      records.delete(key);
      return value;
    },
    async acquireLock(key: string, ttlMs: number) {
      if (pruneKey(key)) {
        return {
          acquired: false,
          release: async () => undefined,
        };
      }

      records.set(key, {
        value: true,
        expiresAt: now() + Math.max(1, ttlMs),
      });

      return {
        acquired: true,
        release: async () => {
          records.delete(key);
        },
      };
    },
  };
}

export function getServerCache(): ServerCache {
  if (!sharedCache) {
    const config = parseRedisConfig(process.env);
    sharedCache = config ? createRedisServerCache(config) : createMemoryServerCache();
  }

  return sharedCache;
}

export function resetServerCacheForTests() {
  sharedCache = null;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function createRedisServerCache(config: RedisConfig): ServerCache {
  const memoryFallback = createMemoryServerCache();

  async function withClient<T>(operation: (client: RedisClientLike) => Promise<T>, fallback: () => Promise<T>) {
    try {
      const client = await getRedisClient(config);
      if (!client) {
        return fallback();
      }
      return await operation(client);
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      return fallback();
    }
  }

  return {
    async getJson<T = unknown>(key: string) {
      return withClient(
        async (client) => {
          const raw = await client.get(key);
          return raw ? (JSON.parse(raw) as T) : null;
        },
        () => memoryFallback.getJson<T>(key),
      );
    },
    async setJson(key: string, value: unknown, ttlMs: number) {
      return withClient(
        async (client) => {
          await client.set(key, JSON.stringify(value), { PX: Math.max(1, ttlMs) });
        },
        () => memoryFallback.setJson(key, value, ttlMs),
      );
    },
    async delete(key: string) {
      return withClient(
        async (client) => {
          await client.del(key);
        },
        () => memoryFallback.delete(key),
      );
    },
    async consumeJson<T = unknown>(key: string) {
      return withClient(
        async (client) => {
          const raw = await client.get(key);
          if (!raw) {
            return null;
          }
          await client.del(key);
          return JSON.parse(raw) as T;
        },
        () => memoryFallback.consumeJson<T>(key),
      );
    },
    async acquireLock(key: string, ttlMs: number) {
      return withClient(
        async (client) => {
          const result = await client.set(key, '1', { PX: Math.max(1, ttlMs), NX: true });
          if (result !== 'OK') {
            return {
              acquired: false,
              release: async () => undefined,
            };
          }
          return {
            acquired: true,
            release: async () => {
              await client.del(key);
            },
          };
        },
        () => memoryFallback.acquireLock(key, ttlMs),
      );
    },
  };
}

async function getRedisClient(config: RedisConfig): Promise<RedisClientLike | null> {
  if (!sharedRedisClientPromise) {
    sharedRedisClientPromise = createRedisClient(config);
  }

  return sharedRedisClientPromise;
}

async function createRedisClient(config: RedisConfig): Promise<RedisClientLike | null> {
  const { createClient } = await import('redis');
  const client = createClient({
    socket: {
      host: config.host,
      port: config.port,
      connectTimeout: config.timeoutMs,
    },
    password: config.password,
    database: config.database,
  }) as RedisClientLike;

  await client.connect();
  return client;
}
