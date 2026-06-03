'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play, Volume2, VolumeX, Film, ImageIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  createAgentRun,
  createAgentRunEventsUrl,
  listVideoModels,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
  type VideoModelOption,
} from '@/features/public/agent-runtime-client';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
  reconcileSelectedModelId,
} from '@/features/public/model-availability';
import type { DirectMediaResultDto } from '@/server/agent/types';

const VIDEO_STYLES = [
  '石头印画', '水墨意境', '赛博朋克', '梦幻童话', '极简抽象', '复古胶片',
];

const DURATIONS = ['5秒', '10秒'];

const CLARITIES = [
  { label: '480P', desc: '标清' },
  { label: '720P', desc: '高清' },
  { label: '1080P', desc: '全高清' },
];

export default function VideoGenPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelAvailability, setModelAvailability] = useState(createInitialModelAvailabilityState());
  const [selectedStyle, setSelectedStyle] = useState('石头印画');
  const [selectedDuration, setSelectedDuration] = useState('5秒');
  const [selectedClarity, setSelectedClarity] = useState('720P');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<DirectMediaResultDto | null>(null);
  const videoReceivedRunIdRef = useRef<string | null>(null);
  const modelLoading = modelAvailability.status === 'loading';
  const modelMaintenanceMessage =
    modelAvailability.status === 'maintenance' ? buildUnavailableModelMessage() : null;
  const submitDisabledReason = !isLoggedIn
    ? null
    : !user || requiresActivation(user)
      ? '账号激活后可使用'
      : modelAvailability.status === 'loading'
        ? '模型列表加载中'
        : modelAvailability.status === 'maintenance'
          ? buildUnavailableModelMessage()
          : !selectedModel
            ? buildUnavailableModelMessage()
            : null;

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setVideoModels([]);
      setSelectedModel(null);
      setModelAvailability(createInitialModelAvailabilityState());
      return;
    }

    let cancelled = false;

    async function loadVideoModels() {
      setModelAvailability((current) => ({
        ...current,
        status: 'loading',
        message: null,
      }));

      try {
        const models = await listVideoModels();
        if (cancelled) {
          return;
        }

        setVideoModels(models);
        setSelectedModel((current) => reconcileSelectedModelId(models, current));
        setModelAvailability((current) => ({
          ...current,
          status: models.length > 0 ? 'ready' : 'maintenance',
          message: models.length > 0 ? null : buildUnavailableModelMessage(),
        }));
      } catch {
        if (cancelled) {
          return;
        }

        setVideoModels([]);
        setSelectedModel(null);
        setModelAvailability((current) => ({
          ...current,
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        }));
      }
    }

    void loadVideoModels();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user, modelAvailability.reloadKey]);

  useEffect(() => {
    if (!streamRunId) {
      return;
    }

    const eventSource = new EventSource(createAgentRunEventsUrl(streamRunId));
    eventSource.addEventListener('artifact_completed', (event) => {
      const payload = parseStreamEventPayload(event);
      const artifact = parseDirectMediaArtifactPayload(payload);
      if (!artifact || artifact.kind !== 'video') {
        return;
      }

      videoReceivedRunIdRef.current = streamRunId;
      setGeneratedVideo(artifact);
      setGenerationError(null);
      setGenerationMessage('视频已生成，请及时下载。');
    });
    eventSource.addEventListener('run_completed', () => {
      eventSource.close();
      setIsGenerating(false);
      setStreamRunId((current) => (current === streamRunId ? null : current));
    });
    eventSource.addEventListener('run_failed', (event) => {
      const payload = parseStreamEventPayload(event);
      const failureMessage =
        payload?.payload &&
        typeof payload.payload === 'object' &&
        typeof (payload.payload as Record<string, unknown>).message === 'string'
          ? ((payload.payload as Record<string, unknown>).message as string)
          : '视频生成请求失败';
      setGenerationError(failureMessage);
      setIsGenerating(false);
      eventSource.close();
      setStreamRunId((current) => (current === streamRunId ? null : current));
    });
    eventSource.onerror = () => {
      eventSource.close();
      setIsGenerating(false);
      setStreamRunId((current) => (current === streamRunId ? null : current));
      if (videoReceivedRunIdRef.current !== streamRunId) {
        setGenerationError('视频生成连接中断，请重试。');
      }
    };

    return () => {
      eventSource.close();
    };
  }, [streamRunId]);

  const handleGenerate = async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    if (isGenerating) return;
    if (!selectedModel) {
      setGenerationMessage(null);
      setGenerationError(modelLoading ? '模型列表加载中' : buildUnavailableModelMessage());
      return;
    }
    if (!prompt.trim()) {
      setGenerationMessage(null);
      setGenerationError('请输入提示词后再开始生成。');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationMessage(null);
    setGeneratedVideo(null);
    videoReceivedRunIdRef.current = null;

    try {
      const { run } = await createAgentRun({
        taskType: 'video',
        prompt: prompt.trim(),
        modelId: selectedModel,
        input: {
          style: selectedStyle,
          duration: selectedDuration,
          clarity: selectedClarity,
          audioEnabled,
        },
      });
      if (run.status === 'failed') {
        setGenerationError(run.errorMessage ?? '视频生成请求失败');
        setIsGenerating(false);
        return;
      }

      if (run.status !== 'running') {
        setGenerationError(run.errorMessage ?? '视频生成请求未进入运行状态，请重试。');
        setIsGenerating(false);
        return;
      }

      setStreamRunId(run.id);
      setGenerationMessage('任务已提交，正在等待模型返回结果。');
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '视频生成请求失败');
      setIsGenerating(false);
    }
  };

  const handleDownloadVideo = () => {
    if (!generatedVideo) return;
    try {
      if (generatedVideo.delivery.mode === 'provider_url') {
        window.open(generatedVideo.delivery.url, '_blank', 'noopener,noreferrer');
        setGenerationMessage('已打开提供方链接，请在新标签页保存视频。');
        return;
      }

      const link = document.createElement('a');
      link.href = generatedVideo.delivery.url;
      link.download =
        typeof generatedVideo.metadata.filename === 'string'
          ? generatedVideo.metadata.filename
          : 'styx-ai-video.mp4';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setGenerationError('下载未能自动开始，请在视频上右键另存为。');
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <Link href="/home" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
              <svg width="12" height="12" viewBox="0 0 40 40" fill="none"><path d="M20 4L8 12V28L20 36L32 28V12L20 4Z" fill="black" /><circle cx="20" cy="20" r="4" fill="white" /></svg>
            </div>
            <span className="text-sm font-semibold">AI视频</span>
          </Link>
          <div className="flex items-center gap-2">
            {isLoggedIn && user ? (
              <UserAvatar avatar={user.avatar} size={24} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
            ) : (
              <button onClick={openLoginModal} className="apple-btn apple-btn-primary cursor-pointer rounded-full px-3 py-1 text-xs">登录</button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {isLoggedIn && user && requiresActivation(user) ? (
          <ProtectedAccountPanel accountState={user.accountState} title="激活账号后使用 AI 视频" />
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left - Controls */}
          <div className="space-y-6">
            {/* Model */}
            <div>
              <label className="mb-2 block text-sm font-medium">视频模型</label>
              {!isLoggedIn ? (
                <div className="rounded-xl border border-black/5 px-4 py-3 text-sm text-[#444444]">登录后查看可用模型</div>
              ) : modelLoading ? (
                <div className="rounded-xl border border-black/5 px-4 py-3 text-sm text-[#444444]">模型加载中...</div>
              ) : modelMaintenanceMessage ? (
                <div className="rounded-xl border border-black/5 px-4 py-3 text-sm text-[#444444]">
                  <p>{modelMaintenanceMessage}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setModelAvailability((current) => ({
                        ...current,
                        reloadKey: nextReloadKey(current.reloadKey),
                      }))
                    }
                    className="mt-2 text-xs font-medium text-[#1d1d1f] transition-colors hover:text-[#555555]"
                  >
                    重新加载模型
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {videoModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left transition-all ${
                        selectedModel === model.id ? 'bg-black/5 border border-black/10' : 'border border-black/5 hover:border-black/8'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{model.name}</span>
                          {model.isDefault ? (
                            <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-[#444444]">默认</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[#444444]">
                          {model.providerName} · {model.entitlementLabel} · {model.pricingSummary}
                        </div>
                      </div>
                      <div className="flex h-5 w-5 items-center justify-center">
                        {selectedModel === model.id ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1d1d1f]">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-black/10" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div>
              <label className="mb-2 block text-sm font-medium">提示词</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想生成的视频..."
                rows={3}
                className="w-full resize-none rounded-xl border border-black/8 bg-white/[0.03] px-4 py-3 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none transition-colors focus:border-black/10"
              />
            </div>

            {/* Style */}
            <div>
              <label className="mb-2 block text-sm font-medium">视频风格</label>
              <div className="flex flex-wrap gap-2">
                {VIDEO_STYLES.map((style) => (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(style)}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-all ${
                      selectedStyle === style ? 'bg-white text-black' : 'border border-black/8 text-[#555555] hover:border-black/10'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="mb-2 block text-sm font-medium">时长</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDuration(d)}
                    className={`cursor-pointer rounded-lg px-4 py-2 text-sm ${
                      selectedDuration === d ? 'bg-white text-black' : 'border border-black/8 text-[#555555]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Clarity */}
            <div>
              <label className="mb-2 block text-sm font-medium">清晰度</label>
              <div className="flex gap-2">
                {CLARITIES.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setSelectedClarity(c.label)}
                    className={`cursor-pointer rounded-lg px-4 py-2 text-sm ${
                      selectedClarity === c.label ? 'bg-white text-black' : 'border border-black/8 text-[#555555]'
                    }`}
                  >
                    <div className="font-medium">{c.label}</div>
                    <div className="text-[10px] opacity-60">{c.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audio */}
            <div className="flex items-center justify-between rounded-xl border border-black/5 px-4 py-3">
              <div className="flex items-center gap-2">
                {audioEnabled ? <Volume2 size={16} className="text-[#555555]" /> : <VolumeX size={16} className="text-[#444444]" />}
                <span className="text-sm">音频</span>
              </div>
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${audioEnabled ? 'bg-white' : 'bg-black/5'}`}
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${audioEnabled ? 'right-0.5 bg-white' : 'left-0.5 bg-[#6e6e73]'}`} />
              </button>
            </div>

            {/* Reference Image */}
            <div>
              <label className="mb-2 block text-sm font-medium">参考首帧图（可选）</label>
              <div className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-black/8 py-8 transition-colors hover:border-black/10">
                <div className="text-center">
                  <ImageIcon size={20} className="mx-auto mb-1 text-[#444444]" />
                  <p className="text-xs text-[#444444]">上传参考图</p>
                </div>
              </div>
            </div>

            <button onClick={handleGenerate} disabled={isGenerating || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
              {isGenerating ? '生成中...' : '开始生成'}
            </button>
            {submitDisabledReason ? <p className="text-xs text-[#6e6e73]">{submitDisabledReason}</p> : null}
          </div>

          {/* Right - Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white/[0.02] p-8">
            {generatedVideo ? (
              <div className="flex w-full flex-col items-center gap-4 text-center">
                <div className="aspect-video w-full overflow-hidden rounded-xl border border-black/5 bg-black">
                  {typeof generatedVideo.metadata.mimeType === 'string' && generatedVideo.metadata.mimeType.startsWith('image/') ? (
                    <img
                      src={generatedVideo.delivery.url}
                      alt={generatedVideo.title}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <video
                      src={generatedVideo.delivery.url}
                      controls
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
                <button onClick={handleDownloadVideo} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-2.5 text-sm font-medium">
                  下载视频
                </button>
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-800">
                  生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。
                </div>
                {generationError ? (
                  <div className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs leading-5 text-red-700">
                    {generationError}
                  </div>
                ) : null}
                {generationMessage ? <p className="text-xs text-[#444444]">{generationMessage}</p> : null}
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
                  <Film size={28} className="animate-pulse text-[#444444]" />
                </div>
                <p className="mb-2 text-sm font-medium">Seedance 2.0 正在造梦...</p>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full animate-pulse rounded-full bg-white/40" style={{ width: '60%' }} />
                </div>
              </div>
            ) : generationError ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                  <Play size={28} className="text-red-500" />
                </div>
                <p className="mb-1 text-sm font-medium text-red-500">生成失败</p>
                <p className="text-xs text-[#444444]">{generationError}</p>
              </div>
            ) : generationMessage ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
                  <Play size={28} className="text-[#444444]" />
                </div>
                <p className="mb-1 text-sm font-medium text-[#555555]">生成完成</p>
                <p className="text-xs text-[#444444]">{generationMessage}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
                  <Play size={28} className="text-[#444444]" />
                </div>
                <p className="mb-1 text-sm font-medium text-[#555555]">视频预览</p>
                <p className="text-xs text-[#444444]">生成的视频将在此处展示</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
