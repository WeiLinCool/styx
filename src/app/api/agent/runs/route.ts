import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AgentRunModelRequiredError,
  createAgentRunService,
} from '@/server/agent/run-service';
import {
  ProviderConfigurationError,
  ProviderRequestError,
} from '@/server/ai/provider-adapters';
import { InsufficientCreditsError } from '@/server/billing/credits';
import { createDeterministicPiRuntime } from '@/server/agent/pi-runtime';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';
import {
  ModelEntitlementRequiredError,
  ModelNotAvailableError,
} from '@/server/repositories/ai-models';

const createAgentRunBodySchema = z
  .object({
    taskType: z.enum(['chat', 'image', 'video', 'workflow']),
    prompt: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'Prompt is required.')),
    modelId: z.string().min(1, 'modelId is required for chat requests.').optional(),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((body, context) => {
    if (body.taskType === 'chat' && !body.modelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modelId'],
        message: 'modelId is required for chat requests.',
      });
    }
  });

export type CreateAgentRunBody = z.infer<typeof createAgentRunBodySchema>;

class InvalidJsonRequestError extends Error {
  constructor() {
    super('Invalid JSON request body.');
    this.name = 'InvalidJsonRequestError';
  }
}

export function parseCreateAgentRunBody(body: unknown): CreateAgentRunBody {
  return createAgentRunBodySchema.parse(body);
}

export async function parseCreateAgentRunRequestBody(request: Request): Promise<CreateAgentRunBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new InvalidJsonRequestError();
  }

  return parseCreateAgentRunBody(body);
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Invalid agent run request.';
}

export function serviceErrorToResponse(error: unknown) {
  if (error instanceof InvalidJsonRequestError) {
    return jsonError('invalid_request', error.message, 400);
  }

  if (error instanceof z.ZodError) {
    return jsonError('invalid_request', validationMessage(error), 400);
  }

  if (error instanceof AgentRunModelRequiredError) {
    return jsonError('model_required', error.message, 400);
  }

  if (error instanceof ModelNotAvailableError) {
    return jsonError('model_not_available', error.message, 404);
  }

  if (error instanceof ModelEntitlementRequiredError) {
    return jsonError('model_entitlement_required', error.message, 403);
  }

  if (error instanceof InsufficientCreditsError) {
    return jsonError('insufficient_credits', error.message, 402);
  }

  if (error instanceof ProviderConfigurationError) {
    return jsonError('provider_unconfigured', error.message, 503);
  }

  if (error instanceof ProviderRequestError) {
    return jsonError('provider_error', error.message, 502);
  }

  const accountResponse = accountErrorToResponse(error);
  if (accountResponse.body.error.code !== 'internal_error') {
    return NextResponse.json(accountResponse.body, { status: accountResponse.status });
  }

  return jsonError('internal_error', 'AI request failed.', 500);
}

function createService() {
  return createAgentRunService({
    repository: getAgentRunRepository(),
    runtime: createDeterministicPiRuntime(),
  });
}

export async function POST(request: Request) {
  try {
    const session = await requireActiveAccount();
    const body = await parseCreateAgentRunRequestBody(request);
    const run = await createService().createAndRunAgentRun({
      userId: session.user.id,
      taskType: body.taskType,
      prompt: body.prompt,
      modelId: body.modelId,
      input: body.input,
    });

    return NextResponse.json({ run });
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const runs = await getAgentRunRepository().listRunsForUser(session.user.id);

    return NextResponse.json({ runs });
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}
