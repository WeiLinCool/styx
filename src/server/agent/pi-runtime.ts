import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
import type { AgentCapabilitySnapshot, AgentTaskType, ResolvedAgentCapability } from './types';

export type PiAgentRunRequest = {
  runId: string;
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  provider: string;
  model: string;
  capabilities: ResolvedAgentCapability[];
  input: Record<string, unknown>;
};

export type PiAgentRunResult = {
  finalMessage: string;
  artifacts: AgentArtifactInput[];
};

export type PiAgentRuntime = {
  run(request: PiAgentRunRequest): Promise<PiAgentRunResult>;
};

export function createDeterministicPiRuntime(): PiAgentRuntime {
  return {
    async run(request) {
      const finalMessage = `已通过 ${request.provider}/${request.model} 处理：${request.prompt}`;

      return {
        finalMessage,
        artifacts: [
          {
            kind: 'text',
            title: 'AI 回复',
            body: finalMessage,
            metadata: {
              provider: request.provider,
              model: request.model,
              taskType: request.taskType,
            },
          },
        ],
      };
    },
  };
}

export function createUnconfiguredCapabilitySnapshot(taskType: AgentTaskType): AgentCapabilitySnapshot {
  return {
    bundleId: `unconfigured-${taskType}`,
    bundleCode: `${taskType}-unconfigured`,
    provider: 'unconfigured',
    model: 'unconfigured',
    capabilities: [
      {
        id: `unconfigured-${taskType}-model`,
        kind: 'model',
        code: 'unconfigured',
        name: '未配置模型',
        config: {
          provider: 'unconfigured',
          model: 'unconfigured',
        },
      },
    ],
  };
}
