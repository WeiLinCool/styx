import type { AgentRunStreamEventDto, AgentRunStreamEventType } from './types';

export type PendingStreamEvent = {
  eventType: AgentRunStreamEventType;
  payload: Record<string, unknown>;
};

export type StreamEventWriter = (events: PendingStreamEvent[]) => Promise<void>;

export function createRunStreamEventBuilder(runId: string) {
  let sequence = 0;

  return {
    next(eventType: AgentRunStreamEventType, payload: Record<string, unknown>): AgentRunStreamEventDto {
      sequence += 1;
      return {
        id: `${runId}-${sequence}`,
        runId,
        sequence,
        eventType,
        payload: structuredClone(payload),
        createdAt: new Date().toISOString(),
      };
    },
    currentSequence() {
      return sequence;
    },
  };
}

export async function* collectStreamEvents(
  source: AsyncGenerator<
    | { type: 'delta'; delta: string }
    | { type: 'final'; finalMessage: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; rawMetadata: Record<string, unknown> },
    void,
    void
  >,
) {
  for await (const event of source) {
    yield event;
  }
}

