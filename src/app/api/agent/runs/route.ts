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
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';
import {
  ModelEntitlementRequiredError,
  ModelNotAvailableError,
} from '@/server/repositories/ai-models';
import type { AgentRunDto, CreateAgentRunResult } from '@/server/agent/types';

const MAX_SOURCE_IMAGE_DATA_URL_BYTES = 10 * 1024 * 1024;

const sourceImageDataUrlSchema = z
  .string()
  .regex(
    /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    'source image must be a supported data URL.',
  )
  .refine(
    (value) => value.length <= MAX_SOURCE_IMAGE_DATA_URL_BYTES,
    'source image data URL is too large.',
  );

const createAgentRunBodySchema = z
  .object({
    taskType: z.enum(['chat', 'image', 'video', 'workflow']),
    prompt: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'Prompt is required.')),
    modelId: z.string().min(1, 'modelId is required for chat requests.').optional(),
    conversationId: z.string().uuid('conversationId must be a valid UUID.').optional(),
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

    if (body.taskType === 'video' && !body.modelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modelId'],
        message: 'modelId is required for video requests.',
      });
    }

    if (body.taskType !== 'image') {
      return;
    }

    if (!body.modelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modelId'],
        message: 'modelId is required for image requests.',
      });
    }

    const mode = body.input.mode;
    if (mode !== 'generate' && mode !== 'edit' && mode !== 'upscale') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['input', 'mode'],
        message: 'image input.mode must be generate, edit, or upscale.',
      });
      return;
    }

    const sourceImageDataUrl = body.input.sourceImageDataUrl;
    if ((mode === 'edit' || mode === 'upscale') && typeof sourceImageDataUrl !== 'string') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['input', 'sourceImageDataUrl'],
        message: 'source image is required for edit and upscale image requests.',
      });
      return;
    }

    if (typeof sourceImageDataUrl === 'string') {
      const parsed = sourceImageDataUrlSchema.safeParse(sourceImageDataUrl);
      if (!parsed.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['input', 'sourceImageDataUrl'],
          message: parsed.error.issues[0]?.message ?? 'source image must be a supported data URL.',
        });
      }
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

export function parseCreateAgentRunRawBody(body: unknown): CreateAgentRunBody {
  return parseCreateAgentRunBody(body);
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function createDeleteAgentRunResponse(run: AgentRunDto | null) {
  if (!run) {
    return jsonError('run_not_found', 'Agent run was not found.', 404);
  }

  return NextResponse.json({ run });
}

export function createAgentRunResponse(result: CreateAgentRunResult) {
  return NextResponse.json({
    run: result.run,
    transientArtifacts: result.transientArtifacts,
  });
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

  return jsonError('internal_error', 'AI 请求失败，请稍后再试', 500);
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
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = parseCreateAgentRunRawBody(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/agent/runs',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const result = await createService().createAndRunAgentRun({
          userId: session.user.id,
          taskType: body.taskType,
          prompt: body.prompt,
          modelId: body.modelId,
          conversationId: body.conversationId,
          input: body.input,
        });

        return createAgentRunResponse(result);
      },
    );
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
