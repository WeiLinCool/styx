import { NextResponse } from 'next/server';

import { serviceErrorToResponse } from '../../route';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

function toSse(data: unknown, event?: string) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `${event ? `event: ${event}\n` : ''}data: ${payload}\n\n`;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;
    const detail = await getAgentRunRepository().getRunDetailForUser(runId, session.user.id);

    if (!detail) {
      return NextResponse.json({ error: { code: 'run_not_found', message: 'Agent run was not found.' } }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const repository = getAgentRunRepository();
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let seenSequence = 0;
        let interval: ReturnType<typeof setInterval> | null = null;
        controller.enqueue(encoder.encode(toSse({ runId, connected: true }, 'connected')));
        for (const event of detail.events) {
          controller.enqueue(encoder.encode(toSse(event, event.eventType)));
          seenSequence = Math.max(seenSequence, event.sequence);
        }

        interval = setInterval(async () => {
          if (closed) {
            return;
          }

          const latestDetail = await repository.getRunDetailForUser(runId, session.user.id);
          if (!latestDetail) {
            closed = true;
            if (interval) {
              clearInterval(interval);
            }
            controller.close();
            return;
          }

          const nextEvents = latestDetail.events.filter((event) => event.sequence > seenSequence);
          for (const event of nextEvents) {
            controller.enqueue(encoder.encode(toSse(event, event.eventType)));
            seenSequence = event.sequence;
          }

          if (latestDetail.run.status === 'succeeded' || latestDetail.run.status === 'failed') {
            closed = true;
            if (interval) {
              clearInterval(interval);
            }
            controller.close();
          }
        }, 500);
      },
      cancel() {
        // ReadableStream cancel is best-effort here; active polling is also stopped on terminal run state.
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}
