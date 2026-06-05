import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import type {
  AgentConversationDto,
  AgentConversationFolderDto,
  AgentConversationListDto,
} from '@/server/agent/types';
import { db, schema } from '@/server/db';

export type CreateAgentConversationInput = {
  id?: string;
  userId: string;
  autoTitle: string;
  lastRunAt?: string;
};

export type CreateAgentConversationFolderInput = {
  userId: string;
  name: string;
};

export type UpdateAgentConversationInput = {
  titleOverride?: string | null;
  folderId?: string | null;
};

export type AgentConversationRepository = {
  createConversation(input: CreateAgentConversationInput): Promise<AgentConversationDto>;
  getConversationForUser(id: string, userId: string): Promise<AgentConversationDto | null>;
  updateConversation(
    id: string,
    userId: string,
    input: UpdateAgentConversationInput,
  ): Promise<AgentConversationDto | null>;
  touchConversation(id: string, userId: string, lastRunAt?: string): Promise<AgentConversationDto | null>;
  softDeleteConversation(id: string, userId: string): Promise<AgentConversationDto | null>;
  listForUser(userId: string): Promise<AgentConversationListDto>;
  createFolder(input: CreateAgentConversationFolderInput): Promise<AgentConversationFolderDto>;
  updateFolder(id: string, userId: string, input: { name: string }): Promise<AgentConversationFolderDto | null>;
  deleteFolder(id: string, userId: string): Promise<AgentConversationFolderDto | null>;
};

type StoredConversationFolder = AgentConversationFolderDto & {
  userId: string;
  deletedAt: string | null;
};

type StoredConversation = Omit<AgentConversationDto, 'title'> & {
  userId: string;
  deletedAt: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(name: string) {
  return name.trim();
}

function normalizeTitleOverride(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function displayTitle(conversation: Pick<StoredConversation, 'autoTitle' | 'titleOverride'>) {
  return conversation.titleOverride?.trim() || conversation.autoTitle;
}

function toFolderDto(folder: StoredConversationFolder): AgentConversationFolderDto {
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

function toConversationDto(conversation: StoredConversation): AgentConversationDto {
  return {
    id: conversation.id,
    folderId: conversation.folderId,
    title: displayTitle(conversation),
    autoTitle: conversation.autoTitle,
    titleOverride: conversation.titleOverride,
    lastRunAt: conversation.lastRunAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function toFolderDtoFromDatabase(folder: typeof schema.agentConversationFolders.$inferSelect): AgentConversationFolderDto {
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAt: toIso(folder.createdAt),
    updatedAt: toIso(folder.updatedAt),
  };
}

function toConversationDtoFromDatabase(
  conversation: typeof schema.agentConversations.$inferSelect,
): AgentConversationDto {
  return {
    id: conversation.id,
    folderId: conversation.folderId,
    title: conversation.titleOverride?.trim() || conversation.autoTitle,
    autoTitle: conversation.autoTitle,
    titleOverride: conversation.titleOverride,
    lastRunAt: toIso(conversation.lastRunAt),
    createdAt: toIso(conversation.createdAt),
    updatedAt: toIso(conversation.updatedAt),
  };
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

type AgentConversationDatabase = NonNullable<typeof db>;

export function createDatabaseAgentConversationRepository(): AgentConversationRepository {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database-backed agent conversation repository.');
  }
  const database: AgentConversationDatabase = db;

  async function getFolder(id: string, userId: string) {
    const [folder] = await database
      .select()
      .from(schema.agentConversationFolders)
      .where(
        and(
          eq(schema.agentConversationFolders.id, id),
          eq(schema.agentConversationFolders.userId, userId),
          isNull(schema.agentConversationFolders.deletedAt),
        ),
      )
      .limit(1);
    return folder ?? null;
  }

  async function getConversation(id: string, userId: string) {
    const [conversation] = await database
      .select()
      .from(schema.agentConversations)
      .where(
        and(
          eq(schema.agentConversations.id, id),
          eq(schema.agentConversations.userId, userId),
          isNull(schema.agentConversations.deletedAt),
        ),
      )
      .limit(1);
    return conversation ?? null;
  }

  return {
    async createConversation(input) {
      const timestamp = input.lastRunAt ? new Date(input.lastRunAt) : new Date();
      const [conversation] = await database
        .insert(schema.agentConversations)
        .values({
          ...(input.id ? { id: input.id } : {}),
          userId: input.userId,
          autoTitle: normalizeName(input.autoTitle) || '新对话',
          lastRunAt: timestamp,
        })
        .returning();
      if (!conversation) {
        throw new Error('Created agent conversation could not be loaded.');
      }
      return toConversationDtoFromDatabase(conversation);
    },
    async getConversationForUser(id, userId) {
      const conversation = await getConversation(id, userId);
      return conversation ? toConversationDtoFromDatabase(conversation) : null;
    },
    async updateConversation(id, userId, input) {
      const conversation = await getConversation(id, userId);
      if (!conversation) {
        return null;
      }
      if (input.folderId !== undefined && input.folderId !== null) {
        const folder = await getFolder(input.folderId, userId);
        if (!folder) {
          return null;
        }
      }

      const titleOverride = normalizeTitleOverride(input.titleOverride);
      const [updated] = await database
        .update(schema.agentConversations)
        .set({
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
          ...(titleOverride !== undefined ? { titleOverride } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.agentConversations.id, id),
            eq(schema.agentConversations.userId, userId),
            isNull(schema.agentConversations.deletedAt),
          ),
        )
        .returning();
      return updated ? toConversationDtoFromDatabase(updated) : null;
    },
    async touchConversation(id, userId, lastRunAt) {
      const [updated] = await database
        .update(schema.agentConversations)
        .set({
          lastRunAt: lastRunAt ? new Date(lastRunAt) : new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.agentConversations.id, id),
            eq(schema.agentConversations.userId, userId),
            isNull(schema.agentConversations.deletedAt),
          ),
        )
        .returning();
      return updated ? toConversationDtoFromDatabase(updated) : null;
    },
    async softDeleteConversation(id, userId) {
      const deletedAt = new Date();
      const [updated] = await database
        .update(schema.agentConversations)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            eq(schema.agentConversations.id, id),
            eq(schema.agentConversations.userId, userId),
            isNull(schema.agentConversations.deletedAt),
          ),
        )
        .returning();
      return updated ? toConversationDtoFromDatabase(updated) : null;
    },
    async listForUser(userId) {
      const [folders, conversations] = await Promise.all([
        database
          .select()
          .from(schema.agentConversationFolders)
          .where(
            and(
              eq(schema.agentConversationFolders.userId, userId),
              isNull(schema.agentConversationFolders.deletedAt),
            ),
          )
          .orderBy(asc(schema.agentConversationFolders.sortOrder), asc(schema.agentConversationFolders.createdAt)),
        database
          .select()
          .from(schema.agentConversations)
          .where(
            and(
              eq(schema.agentConversations.userId, userId),
              isNull(schema.agentConversations.deletedAt),
            ),
          )
          .orderBy(desc(schema.agentConversations.lastRunAt)),
      ]);
      return {
        folders: folders.map(toFolderDtoFromDatabase),
        conversations: conversations.map(toConversationDtoFromDatabase),
      };
    },
    async createFolder(input) {
      const activeFolders = await database
        .select({ id: schema.agentConversationFolders.id })
        .from(schema.agentConversationFolders)
        .where(
          and(
            eq(schema.agentConversationFolders.userId, input.userId),
            isNull(schema.agentConversationFolders.deletedAt),
          ),
        );
      const [folder] = await database
        .insert(schema.agentConversationFolders)
        .values({
          userId: input.userId,
          name: normalizeName(input.name),
          sortOrder: activeFolders.length,
        })
        .returning();
      if (!folder) {
        throw new Error('Created agent conversation folder could not be loaded.');
      }
      return toFolderDtoFromDatabase(folder);
    },
    async updateFolder(id, userId, input) {
      const [folder] = await database
        .update(schema.agentConversationFolders)
        .set({ name: normalizeName(input.name), updatedAt: new Date() })
        .where(
          and(
            eq(schema.agentConversationFolders.id, id),
            eq(schema.agentConversationFolders.userId, userId),
            isNull(schema.agentConversationFolders.deletedAt),
          ),
        )
        .returning();
      return folder ? toFolderDtoFromDatabase(folder) : null;
    },
    async deleteFolder(id, userId) {
      const folder = await getFolder(id, userId);
      if (!folder) {
        return null;
      }
      const deletedAt = new Date();
      await database
        .update(schema.agentConversations)
        .set({ folderId: null, updatedAt: deletedAt })
        .where(
          and(
            eq(schema.agentConversations.folderId, id),
            eq(schema.agentConversations.userId, userId),
            isNull(schema.agentConversations.deletedAt),
          ),
        );
      const [deleted] = await database
        .update(schema.agentConversationFolders)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            eq(schema.agentConversationFolders.id, id),
            eq(schema.agentConversationFolders.userId, userId),
            isNull(schema.agentConversationFolders.deletedAt),
          ),
        )
        .returning();
      return deleted ? toFolderDtoFromDatabase(deleted) : null;
    },
  };
}

export function createMemoryAgentConversationRepository(): AgentConversationRepository {
  const folders = new Map<string, StoredConversationFolder>();
  const conversations = new Map<string, StoredConversation>();

  function findActiveFolder(id: string, userId: string) {
    const folder = folders.get(id);
    return folder && folder.userId === userId && !folder.deletedAt ? folder : null;
  }

  function findActiveConversation(id: string, userId: string) {
    const conversation = conversations.get(id);
    return conversation && conversation.userId === userId && !conversation.deletedAt ? conversation : null;
  }

  return {
    async createConversation(input) {
      const timestamp = nowIso();
      const autoTitle = normalizeName(input.autoTitle);
      const conversation: StoredConversation = {
        id: input.id ?? randomUUID(),
        userId: input.userId,
        folderId: null,
        autoTitle: autoTitle || '新对话',
        titleOverride: null,
        lastRunAt: input.lastRunAt ?? timestamp,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      conversations.set(conversation.id, conversation);
      return toConversationDto(conversation);
    },
    async getConversationForUser(id, userId) {
      const conversation = findActiveConversation(id, userId);
      return conversation ? toConversationDto(conversation) : null;
    },
    async updateConversation(id, userId, input) {
      const conversation = findActiveConversation(id, userId);
      if (!conversation) {
        return null;
      }

      if (input.folderId !== undefined) {
        if (input.folderId === null) {
          conversation.folderId = null;
        } else if (findActiveFolder(input.folderId, userId)) {
          conversation.folderId = input.folderId;
        } else {
          return null;
        }
      }

      const titleOverride = normalizeTitleOverride(input.titleOverride);
      if (titleOverride !== undefined) {
        conversation.titleOverride = titleOverride;
      }

      conversation.updatedAt = nowIso();
      return toConversationDto(conversation);
    },
    async touchConversation(id, userId, lastRunAt) {
      const conversation = findActiveConversation(id, userId);
      if (!conversation) {
        return null;
      }
      const timestamp = nowIso();
      conversation.lastRunAt = lastRunAt ?? timestamp;
      conversation.updatedAt = timestamp;
      return toConversationDto(conversation);
    },
    async softDeleteConversation(id, userId) {
      const conversation = findActiveConversation(id, userId);
      if (!conversation) {
        return null;
      }
      const timestamp = nowIso();
      conversation.deletedAt = timestamp;
      conversation.updatedAt = timestamp;
      return toConversationDto(conversation);
    },
    async listForUser(userId) {
      return {
        folders: Array.from(folders.values())
          .filter((folder) => folder.userId === userId && !folder.deletedAt)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
          .map(toFolderDto),
        conversations: Array.from(conversations.values())
          .filter((conversation) => conversation.userId === userId && !conversation.deletedAt)
          .sort((a, b) => b.lastRunAt.localeCompare(a.lastRunAt))
          .map(toConversationDto),
      };
    },
    async createFolder(input) {
      const timestamp = nowIso();
      const folder: StoredConversationFolder = {
        id: randomUUID(),
        userId: input.userId,
        name: normalizeName(input.name),
        sortOrder: Array.from(folders.values()).filter(
          (item) => item.userId === input.userId && !item.deletedAt,
        ).length,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      folders.set(folder.id, folder);
      return toFolderDto(folder);
    },
    async updateFolder(id, userId, input) {
      const folder = findActiveFolder(id, userId);
      if (!folder) {
        return null;
      }
      folder.name = normalizeName(input.name);
      folder.updatedAt = nowIso();
      return toFolderDto(folder);
    },
    async deleteFolder(id, userId) {
      const folder = findActiveFolder(id, userId);
      if (!folder) {
        return null;
      }
      folder.deletedAt = nowIso();
      folder.updatedAt = folder.deletedAt;
      for (const conversation of conversations.values()) {
        if (conversation.userId === userId && conversation.folderId === id && !conversation.deletedAt) {
          conversation.folderId = null;
          conversation.updatedAt = folder.deletedAt;
        }
      }
      return toFolderDto(folder);
    },
  };
}

const globalDevelopmentAgentConversationRepository = globalThis as typeof globalThis & {
  __styxAgentConversationRepository?: AgentConversationRepository;
};

export function getAgentConversationRepository(): AgentConversationRepository {
  if (process.env.DATABASE_URL) {
    return createDatabaseAgentConversationRepository();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for agent conversation repository in production.');
  }

  globalDevelopmentAgentConversationRepository.__styxAgentConversationRepository ??=
    createMemoryAgentConversationRepository();
  return globalDevelopmentAgentConversationRepository.__styxAgentConversationRepository;
}
