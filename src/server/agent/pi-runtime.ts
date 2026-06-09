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
      if (request.taskType === 'workflow') {
        const sourceImageOrigin =
          request.input.sourceImageOrigin === 'generated' ? 'generated' : 'manual';
        const selectedImageModelId =
          typeof request.input.selectedImageModelId === 'string' &&
          request.input.selectedImageModelId.trim().length > 0
            ? request.input.selectedImageModelId.trim()
            : null;
        const promptSummary = request.prompt.replace(/[<>&"]/g, '').slice(0, 140);
        const svg = createWorkflowStoryboardSvg({
          promptSummary,
          sourceImageOrigin,
          selectedImageModelId,
          sourceImageAvailable: typeof request.input.sourceImageDataUrl === 'string',
        });
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

        return {
          finalMessage: '12宫格分镜图已生成，请及时查看。',
          artifacts: [
            {
              kind: 'image',
              title: '12宫格分镜图',
              body: dataUrl,
              metadata: {
                transient: true,
                mimeType: 'image/svg+xml',
                width: 821,
                height: 1916,
                provider: request.provider,
                model: request.model,
                taskType: request.taskType,
                storyboardStage: 'workflow-storyboard',
                sourceImageOrigin,
                sourceImageAvailable: typeof request.input.sourceImageDataUrl === 'string',
                ...(selectedImageModelId ? { selectedImageModelId } : {}),
                promptSummary,
              },
            },
          ],
        };
      }

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

      if (request.taskType === 'video') {
        const safePrompt = request.prompt.replace(/[<>&"]/g, '');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#101418"/><text x="640" y="330" text-anchor="middle" font-family="Arial" font-size="48" fill="#ffffff">AI Video Preview</text><text x="640" y="390" text-anchor="middle" font-family="Arial" font-size="28" fill="#b8c0cc">${safePrompt}</text></svg>`;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

        return {
          finalMessage: '视频已生成，请及时下载保存。',
          artifacts: [
            {
              kind: 'video',
              title: '生成视频',
              url: dataUrl,
              metadata: {
                transient: true,
                mimeType: 'image/svg+xml',
                filename: `styx-ai-video-${request.runId}.svg`,
                width: 1280,
                height: 720,
                durationSeconds: 5,
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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createWorkflowStoryboardSvg(input: {
  promptSummary: string;
  sourceImageOrigin: 'manual' | 'generated';
  sourceImageAvailable: boolean;
  selectedImageModelId: string | null;
}) {
  const cols = 3;
  const rows = 4;
  const canvasWidth = 821;
  const canvasHeight = 1916;
  const outerPadding = 28;
  const headerHeight = 152;
  const footerHeight = 112;
  const gap = 14;
  const innerWidth = canvasWidth - outerPadding * 2;
  const innerHeight = canvasHeight - outerPadding * 2 - headerHeight - footerHeight;
  const cellWidth = (innerWidth - gap * (cols - 1)) / cols;
  const cellHeight = (innerHeight - gap * (rows - 1)) / rows;

  const cells = Array.from({ length: cols * rows }, (_, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const x = outerPadding + column * (cellWidth + gap);
    const y = outerPadding + headerHeight + row * (cellHeight + gap);
    const isSource = index === 0;
    const bandFill = ['#f9f5ef', '#f5efe5', '#f1eadc', '#ece4d1'][row] ?? '#f5efe5';
    const accent = ['#d9c7ad', '#cdb99c', '#b8a58a', '#a99273'][column] ?? '#c8b49a';
    const sourceLabel = isSource
      ? input.sourceImageOrigin === 'generated'
        ? 'AI 生图'
        : '手动上传'
      : `步骤 ${index + 1}`;
    const detail = isSource
      ? input.sourceImageAvailable
        ? '当前源图'
        : '源图缺失'
      : index < 6
        ? '构图分镜'
        : index < 10
          ? '显影过程'
          : '成品石头';

    return `
      <g transform="translate(${x} ${y})">
        <rect width="${cellWidth}" height="${cellHeight}" rx="26" fill="${bandFill}" stroke="#24211c" stroke-opacity="0.12" stroke-width="1.5" />
        <rect x="12" y="12" width="${cellWidth - 24}" height="${cellHeight - 24}" rx="20" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="2" />
        <rect x="20" y="20" width="${cellWidth - 40}" height="${Math.max(36, cellHeight * 0.16)}" rx="16" fill="${accent}" fill-opacity="0.15" />
        <circle cx="${cellWidth - 36}" cy="38" r="15" fill="#1b1b1b" />
        <text x="${cellWidth - 36}" y="43" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#ffffff" font-weight="700">${index + 1}</text>
        <text x="28" y="${Math.min(92, cellHeight * 0.28)}" font-family="Arial, sans-serif" font-size="18" fill="#1c1c1e" font-weight="700">${escapeSvgText(sourceLabel)}</text>
        <text x="28" y="${Math.min(126, cellHeight * 0.38)}" font-family="Arial, sans-serif" font-size="14" fill="#555555">${escapeSvgText(detail)}</text>
        <rect x="28" y="${cellHeight - 88}" width="${cellWidth - 56}" height="48" rx="18" fill="#ffffff" fill-opacity="0.6" />
        <path d="M 38 ${cellHeight - 64} C ${cellWidth * 0.23} ${cellHeight - 94}, ${cellWidth * 0.46} ${cellHeight - 34}, ${cellWidth * 0.72} ${cellHeight - 68} S ${cellWidth - 42} ${cellHeight - 44}, ${cellWidth - 34} ${cellHeight - 78}" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    `;
  }).join('');

  const promptSnippet = escapeSvgText(input.promptSummary || 'workflow storyboard');
  const modelLabel = input.selectedImageModelId ? escapeSvgText(input.selectedImageModelId) : 'server-owned';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f7f3ea" />
          <stop offset="48%" stop-color="#eee6d7" />
          <stop offset="100%" stop-color="#e0d4c0" />
        </linearGradient>
        <linearGradient id="frame" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#2b241c" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#514436" stop-opacity="0.75" />
        </linearGradient>
      </defs>
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="#181512" />
      <rect x="${outerPadding}" y="${outerPadding}" width="${canvasWidth - outerPadding * 2}" height="${canvasHeight - outerPadding * 2}" rx="36" fill="url(#bg)" />
      <rect x="${outerPadding + 10}" y="${outerPadding + 10}" width="${canvasWidth - (outerPadding + 10) * 2}" height="${canvasHeight - (outerPadding + 10) * 2}" rx="30" fill="none" stroke="url(#frame)" stroke-width="2.5" />
      <text x="${canvasWidth / 2}" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#201a14" font-weight="700">12 宫格分镜图</text>
      <text x="${canvasWidth / 2}" y="124" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#6a5d4d">server-owned storyboard · ${modelLabel}</text>
      <text x="${outerPadding + 26}" y="160" font-family="Arial, sans-serif" font-size="14" fill="#7a6a56">prompt: ${promptSnippet}</text>
      ${cells}
      <text x="${outerPadding + 26}" y="${canvasHeight - 68}" font-family="Arial, sans-serif" font-size="14" fill="#645746">source image origin: ${escapeSvgText(input.sourceImageOrigin)} · source available: ${input.sourceImageAvailable ? 'yes' : 'no'}</text>
      <text x="${outerPadding + 26}" y="${canvasHeight - 42}" font-family="Arial, sans-serif" font-size="13" fill="#7b6d5b">3 columns × 4 rows · fixed 821×1916 layout</text>
    </svg>
  `;
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
