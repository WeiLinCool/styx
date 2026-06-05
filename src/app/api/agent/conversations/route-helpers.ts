import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import type {
  AgentConversationDto,
  AgentConversationListDto,
} from '@/server/agent/types';

const updateAgentConversationBodySchema = z
  .object({
    titleOverride: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(80, 'Conversation title is too long.'))
      .nullable()
      .optional(),
    folderId: z.string().uuid('folderId must be a valid UUID.').nullable().optional(),
  })
  .refine((body) => body.titleOverride !== undefined || body.folderId !== undefined, {
    message: 'Conversation update requires at least one field.',
  });

export type UpdateAgentConversationBody = z.infer<typeof updateAgentConversationBodySchema>;

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function parseUpdateAgentConversationBody(body: unknown): UpdateAgentConversationBody {
  return updateAgentConversationBodySchema.parse(body);
}

export function createAgentConversationListResponse(list: AgentConversationListDto) {
  return NextResponse.json(list);
}

export function createAgentConversationUpdateResponse(conversation: AgentConversationDto | null) {
  if (!conversation) {
    return jsonError('conversation_not_found', 'Agent conversation was not found.', 404);
  }

  return NextResponse.json({ conversation });
}

export function conversationRouteErrorToResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return jsonError(
      'invalid_request',
      error.issues[0]?.message ?? 'Conversation request is invalid.',
      400,
    );
  }

  const accountResponse = accountErrorToResponse(error);
  if (accountResponse.body.error.code !== 'internal_error') {
    return NextResponse.json(accountResponse.body, { status: accountResponse.status });
  }

  return jsonError('internal_error', 'Conversation request failed.', 500);
}
