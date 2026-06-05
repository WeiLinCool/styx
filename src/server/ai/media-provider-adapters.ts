import type { ResolvedImageModel, ResolvedVideoModel } from '@/server/repositories/ai-models';
import {
  createDoubaoImageProviderAdapter,
  type ImageProviderRequest,
  type ImageProviderResult,
} from './image-provider-adapters';
import {
  createDoubaoVideoTaskAdapter,
  type VideoProviderCreateRequest,
  type VideoProviderStatusRequest,
  type VideoTaskCreatedResult,
  type VideoTaskStatusResult,
} from './video-provider-adapters';
import { ProviderConfigurationError } from './provider-adapters';

export type MediaExecutionProtocol =
  | 'image_openai_compatible'
  | 'video_task_polling';

export type MediaProviderAdapter = {
  protocol: MediaExecutionProtocol;
  createImage?: (request: ImageProviderRequest) => Promise<ImageProviderResult>;
  createVideoTask?: (request: VideoProviderCreateRequest) => Promise<VideoTaskCreatedResult>;
  getVideoTask?: (request: VideoProviderStatusRequest) => Promise<VideoTaskStatusResult>;
};

export function createMediaProviderAdapter(
  model: ResolvedImageModel | ResolvedVideoModel,
): MediaProviderAdapter {
  if (model.executionProtocol === 'image_openai_compatible') {
    const adapter = createDoubaoImageProviderAdapter();
    return {
      protocol: 'image_openai_compatible',
      createImage: (request) => adapter.runImage(request),
    };
  }

  if (model.executionProtocol === 'video_task_polling') {
    const adapter = createDoubaoVideoTaskAdapter();
    return {
      protocol: 'video_task_polling',
      createVideoTask: adapter.createVideoTask,
      getVideoTask: adapter.getVideoTask,
    };
  }

  throw new ProviderConfigurationError(
    `Unsupported media execution protocol: ${String((model as { executionProtocol?: unknown }).executionProtocol)}`,
  );
}
