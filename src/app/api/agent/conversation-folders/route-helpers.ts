import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import type { AgentConversationFolderDto } from '@/server/agent/types';

const folderBodySchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'Folder name is required.').max(60, 'Folder name is too long.')),
});

export type AgentConversationFolderBody = z.infer<typeof folderBodySchema>;

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function parseCreateAgentConversationFolderBody(body: unknown): AgentConversationFolderBody {
  return folderBodySchema.parse(body);
}

export function parseUpdateAgentConversationFolderBody(body: unknown): AgentConversationFolderBody {
  return folderBodySchema.parse(body);
}

export function createAgentConversationFolderResponse(folder: AgentConversationFolderDto | null) {
  if (!folder) {
    return jsonError('folder_not_found', 'Agent conversation folder was not found.', 404);
  }

  return NextResponse.json({ folder });
}

export function folderRouteErrorToResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return jsonError(
      'invalid_request',
      error.issues[0]?.message ?? 'Conversation folder request is invalid.',
      400,
    );
  }

  const accountResponse = accountErrorToResponse(error);
  if (accountResponse.body.error.code !== 'internal_error') {
    return NextResponse.json(accountResponse.body, { status: accountResponse.status });
  }

  return jsonError('internal_error', 'Conversation folder request failed.', 500);
}
