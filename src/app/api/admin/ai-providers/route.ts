import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { parseProviderBillingRules } from '@/server/billing/provider-rules';
import { createAiProvider } from '@/server/repositories/ai-models';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { adminText } from '@/features/admin/admin-i18n';

function parseBillingRulesAtBoundary(value: unknown, context: z.RefinementCtx) {
  try {
    return typeof value === 'undefined' ? {} : parseProviderBillingRules(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : adminText.api.billingRulesInvalid,
    });
    return z.NEVER;
  }
}

const bodySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  providerType: z.enum(['openai_compatible', 'development']),
  baseUrl: z.string().trim().min(1).nullable(),
  credentialEnvKey: z.string().trim().min(1).nullable(),
  status: z.enum(['enabled', 'disabled']),
  billingRules: z.unknown().optional().transform(parseBillingRulesAtBoundary),
});

export async function parseAiProviderCreateBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/ai-providers',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const provider = await createAiProvider(body);

        return NextResponse.json({ ok: true, provider }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
            error: {
              code: 'validation_error',
              message: adminText.api.aiProviderCreateInvalid,
              issues: error.issues,
            },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
