import type { AgentRunDto, AgentTaskType } from '@/server/agent/types';

export type CreateAgentRunRequest = {
  taskType: AgentTaskType;
  prompt: string;
  input?: Record<string, unknown>;
};

export async function createAgentRun(input: CreateAgentRunRequest): Promise<AgentRunDto> {
  const response = await fetch('/api/agent/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'AI 请求失败');
  }

  return payload.run;
}

export async function listAgentRuns(): Promise<AgentRunDto[]> {
  const response = await fetch('/api/agent/runs', {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? '历史记录加载失败');
  }

  return payload.runs ?? [];
}
