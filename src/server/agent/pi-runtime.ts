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
      if (request.taskType === 'image') {
        const safePrompt = request.prompt.replace(/[<>&"]/g, '');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#f4f1e8"/><circle cx="512" cy="512" r="320" fill="#d8dde2"/><text x="512" y="500" text-anchor="middle" font-family="Arial" font-size="42" fill="#1d1d1f">AI Image Preview</text><text x="512" y="560" text-anchor="middle" font-family="Arial" font-size="26" fill="#555555">${safePrompt}</text></svg>`;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

        return {
          finalMessage: '图片已生成，请及时下载保存。',
          artifacts: [
            {
              kind: 'image',
              title: '生成图片',
              body: dataUrl,
              metadata: {
                transient: true,
                mimeType: 'image/svg+xml',
                width: 1024,
                height: 1024,
                provider: request.provider,
                model: request.model,
                taskType: request.taskType,
              },
            },
          ],
        };
      }

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
