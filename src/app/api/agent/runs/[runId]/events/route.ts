import { NextResponse } from 'next/server';

import type { AgentRunDetailDto } from '@/server/agent/types';
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

type AgentRunEventsRepository = {
  getRunDetailForUser(runId: string, userId: string): Promise<AgentRunDetailDto | null>;
};

export function createAgentRunEventsStream(input: {
  runId: string;
  userId: string;
  detail: AgentRunDetailDto;
  repository: AgentRunEventsRepository;
  pollIntervalMs?: number;
}) {
  const { runId, userId, detail, repository } = input;
  const pollIntervalMs = input.pollIntervalMs ?? 500;
  const encoder = new TextEncoder();
  let cancelStream: (() => void) | null = null;

  return new ReadableStream({
    start(controller) {
      let closed = false;
      let seenSequence = 0;
      let interval: ReturnType<typeof setInterval> | null = null;

      const closeStreamImpl = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (interval) {
          clearInterval(interval);
          interval = null;
        }

        try {
          controller.close();
        } catch {
          // The consumer may have already closed the stream.
        }
      };

      const enqueueIfOpen = (data: unknown, eventType?: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(toSse(data, eventType)));
        } catch {
          closeStreamImpl();
        }
      };

      enqueueIfOpen({ runId, connected: true }, 'connected');
      for (const event of detail.events) {
        enqueueIfOpen(event, event.eventType);
        seenSequence = Math.max(seenSequence, event.sequence);
      }

      interval = setInterval(() => {
        if (closed) {
          return;
        }

        void (async () => {
          const latestDetail = await repository.getRunDetailForUser(runId, userId);
          if (closed) {
            return;
          }

          if (!latestDetail) {
            closeStreamImpl();
            return;
          }

          const nextEvents = latestDetail.events.filter((event) => event.sequence > seenSequence);
          for (const event of nextEvents) {
            if (closed) {
              return;
            }

            enqueueIfOpen(event, event.eventType);
            seenSequence = event.sequence;
          }

          if (latestDetail.run.status === 'succeeded' || latestDetail.run.status === 'failed') {
            closeStreamImpl();
          }
        })().catch(() => {
          closeStreamImpl();
        });
      }, pollIntervalMs);

      cancelStream = closeStreamImpl;
      },
      cancel() {
        cancelStream?.();
        cancelStream = null;
      },
    });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;
    const detail = await getAgentRunRepository().getRunDetailForUser(runId, session.user.id);

    if (!detail) {
      return NextResponse.json({ error: { code: 'run_not_found', message: 'Agent run was not found.' } }, { status: 404 });
    }

    const stream = createAgentRunEventsStream({
      runId,
      userId: session.user.id,
      detail,
      repository: getAgentRunRepository(),
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
