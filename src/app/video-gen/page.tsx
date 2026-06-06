'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play, Film, ImageIcon, Music,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  createAgentRun,
  createAgentRunEventsUrl,
  getVideoGenerationConfig,
  listSavedMediaAssets,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
  saveGeneratedMedia,
  syncAgentRun,
  uploadUserMedia,
  type VideoGenerationConfigDto,
  type VideoModelOption,
} from '@/features/public/agent-runtime-client';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
  reconcileSelectedModelId,
} from '@/features/public/model-availability';
import type { DirectMediaResultDto, GeneratedMediaAssetDto } from '@/server/agent/types';

const IMAGE_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp';
const AUDIO_UPLOAD_ACCEPT = 'audio/mpeg,audio/wav,audio/mp4,audio/x-wav';

const emptyVideoConfig: VideoGenerationConfigDto = {
  enabled: false,
  upgradeRequired: false,
  message: null,
  styles: [],
  durations: [],
  resolutions: [],
  defaults: {
    styleCode: null,
    durationSeconds: null,
    resolution: null,
  },
  models: [],
};

function reconcileSelectedValue<T extends string | number>(
  values: T[],
  priorValue: T | null,
  defaultValue: T | null,
): T | null {
  if (priorValue !== null && values.includes(priorValue)) {
    return priorValue;
  }
  if (defaultValue !== null && values.includes(defaultValue)) {
    return defaultValue;
  }
  return values[0] ?? null;
}

function describeMediaAsset(asset: GeneratedMediaAssetDto) {
  const details = [asset.mimeType, asset.originalFilename].filter(Boolean).join(' · ');
  return details ? `${asset.title} (${details})` : asset.title;
}

function addMediaAssetIfMissing(
  assets: GeneratedMediaAssetDto[],
  asset: GeneratedMediaAssetDto,
) {
  return assets.some((current) => current.id === asset.id) ? assets : [asset, ...assets];
}

export default function VideoGenPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [videoConfig, setVideoConfig] = useState<VideoGenerationConfigDto>(emptyVideoConfig);
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelAvailability, setModelAvailability] = useState(createInitialModelAvailabilityState());
  const [selectedStyleCode, setSelectedStyleCode] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [savedImageAssets, setSavedImageAssets] = useState<GeneratedMediaAssetDto[]>([]);
  const [savedAudioAssets, setSavedAudioAssets] = useState<GeneratedMediaAssetDto[]>([]);
  const [selectedImageAssetId, setSelectedImageAssetId] = useState('');
  const [selectedAudioAssetId, setSelectedAudioAssetId] = useState('');
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<DirectMediaResultDto | null>(null);
  const [generatedVideoRunId, setGeneratedVideoRunId] = useState<string | null>(null);
  const videoReceivedRunIdRef = useRef<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const modelLoading = modelAvailability.status === 'loading';
  const modelMaintenanceMessage =
    modelAvailability.status === 'maintenance' ? buildUnavailableModelMessage() : null;
  const configDisabledMessage =
    isLoggedIn && user && !requiresActivation(user) && !modelLoading && !videoConfig.enabled
      ? videoConfig.message ??
        (videoConfig.upgradeRequired ? 'AI 视频生成是会员权益，开通会员后即可使用。' : '视频生成暂未开放，请稍后再试。')
      : null;
  const submitDisabledReason = !isLoggedIn
    ? null
    : !user || requiresActivation(user)
      ? '账号激活后可使用'
      : modelAvailability.status === 'loading'
        ? '视频配置加载中'
        : !videoConfig.enabled
          ? configDisabledMessage
          : modelAvailability.status === 'maintenance'
            ? buildUnavailableModelMessage()
            : !selectedModel
              ? buildUnavailableModelMessage()
              : !selectedStyleCode || !durationSeconds || !resolution
                ? '请选择完整视频参数'
                : null;

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setVideoConfig(emptyVideoConfig);
      setVideoModels([]);
      setSelectedModel(null);
      setSelectedStyleCode(null);
      setDurationSeconds(null);
      setResolution(null);
      setSavedImageAssets([]);
      setSavedAudioAssets([]);
      setSelectedImageAssetId('');
      setSelectedAudioAssetId('');
      setPendingImageFile(null);
      setPendingAudioFile(null);
      setModelAvailability(createInitialModelAvailabilityState());
      return;
    }

    let cancelled = false;

    async function loadVideoConfig() {
      setModelAvailability((current) => ({
        ...current,
        status: 'loading',
        message: null,
      }));

      try {
        const config = await getVideoGenerationConfig();
        if (cancelled) {
          return;
        }

        setVideoConfig(config);
        setVideoModels(config.models);
        setSelectedModel((current) => reconcileSelectedModelId(config.models, current));
        setSelectedStyleCode((current) =>
          reconcileSelectedValue(
            config.styles.map((style) => style.code),
            current,
            config.defaults.styleCode,
          ),
        );
        setDurationSeconds((current) =>
          reconcileSelectedValue(config.durations, current, config.defaults.durationSeconds),
        );
        setResolution((current) =>
          reconcileSelectedValue(
            config.resolutions.map((item) => item.value),
            current,
            config.defaults.resolution,
          ),
        );
        setModelAvailability((current) => ({
          ...current,
          status: config.enabled && config.models.length > 0 ? 'ready' : 'maintenance',
          message: config.enabled && config.models.length === 0 ? buildUnavailableModelMessage() : config.message,
        }));
      } catch {
        if (cancelled) {
          return;
        }

        setVideoConfig(emptyVideoConfig);
        setVideoModels([]);
        setSelectedModel(null);
        setSelectedStyleCode(null);
        setDurationSeconds(null);
        setResolution(null);
        setModelAvailability((current) => ({
          ...current,
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        }));
      }
    }

    void loadVideoConfig();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user, modelAvailability.reloadKey]);

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user) || !videoConfig.enabled) {
      setSavedImageAssets([]);
      setSavedAudioAssets([]);
      setSelectedImageAssetId('');
      setSelectedAudioAssetId('');
      return;
    }

    let cancelled = false;

    async function loadSavedMediaAssets() {
      try {
        const assets = await listSavedMediaAssets();
        if (cancelled) {
          return;
        }

        setSavedImageAssets(assets.filter((asset) => asset.kind === 'image' && asset.status === 'ready'));
        setSavedAudioAssets(assets.filter((asset) => asset.kind === 'audio' && asset.status === 'ready'));
      } catch {
        if (cancelled) {
          return;
        }
        setSavedImageAssets([]);
        setSavedAudioAssets([]);
      }
    }

    void loadSavedMediaAssets();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user, videoConfig.enabled]);

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
      setGeneratedVideoRunId(streamRunId);
      setGenerationError(null);
      setGenerationMessage('视频已生成，请及时下载。');
    });
    eventSource.addEventListener('run_completed', () => {
      void syncAgentRun(streamRunId)
        .catch(() => null)
        .finally(() => {
          eventSource.close();
          setIsGenerating(false);
          setStreamRunId((current) => (current === streamRunId ? null : current));
        });
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

  useEffect(() => {
    if (!streamRunId) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      void syncAgentRun(streamRunId)
        .then((run) => {
          if (cancelled || (run.status !== 'succeeded' && run.status !== 'failed')) {
            return;
          }

          setIsGenerating(false);
          setStreamRunId((current) => (current === streamRunId ? null : current));
          if (run.status === 'failed') {
            setGenerationError(run.errorMessage ?? '视频生成请求失败');
          }
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setGenerationError('视频任务同步失败，请稍后重试。');
          setIsGenerating(false);
          setStreamRunId((current) => (current === streamRunId ? null : current));
        });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [streamRunId]);

  const clearPendingImageFile = () => {
    setPendingImageFile(null);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
    }
  };

  const clearPendingAudioFile = () => {
    setPendingAudioFile(null);
    if (audioFileInputRef.current) {
      audioFileInputRef.current.value = '';
    }
  };

  const selectImageAsset = (assetId: string) => {
    setSelectedImageAssetId(assetId);
    if (assetId) {
      clearPendingImageFile();
    }
  };

  const selectAudioAsset = (assetId: string) => {
    setSelectedAudioAssetId(assetId);
    if (assetId) {
      clearPendingAudioFile();
    }
  };

  const handleGenerate = async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    if (isGenerating) return;
    if (!videoConfig.enabled) {
      setGenerationMessage(null);
      setGenerationError(configDisabledMessage ?? '当前账号暂不可使用视频生成。');
      return;
    }
    if (!selectedModel) {
      setGenerationMessage(null);
      setGenerationError(modelLoading ? '模型列表加载中' : buildUnavailableModelMessage());
      return;
    }
    if (!selectedStyleCode || !durationSeconds || !resolution) {
      setGenerationMessage(null);
      setGenerationError('请选择完整视频参数后再开始生成。');
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
    setGeneratedVideoRunId(null);
    videoReceivedRunIdRef.current = null;

    try {
      let imageAssetId = selectedImageAssetId || null;
      let audioAssetId = selectedAudioAssetId || null;

      if (pendingImageFile) {
        setGenerationMessage('正在上传参考图...');
        const asset = await uploadUserMedia({ file: pendingImageFile });
        if (asset.kind !== 'image') {
          throw new Error('上传的参考图类型无效，请选择图片文件。');
        }
        imageAssetId = asset.id;
        setSavedImageAssets((current) => addMediaAssetIfMissing(current, asset));
        setSelectedImageAssetId(asset.id);
        clearPendingImageFile();
      }

      if (pendingAudioFile) {
        setGenerationMessage('正在上传音频素材...');
        const asset = await uploadUserMedia({ file: pendingAudioFile });
        if (asset.kind !== 'audio') {
          throw new Error('上传的音频素材类型无效，请选择音频文件。');
        }
        audioAssetId = asset.id;
        setSavedAudioAssets((current) => addMediaAssetIfMissing(current, asset));
        setSelectedAudioAssetId(asset.id);
        clearPendingAudioFile();
      }

      const { run } = await createAgentRun({
        taskType: 'video',
        prompt: prompt.trim(),
        modelId: selectedModel,
        input: {
          styleCode: selectedStyleCode,
          durationSeconds,
          resolution,
          ...(imageAssetId ? { imageAssetId } : {}),
          ...(audioAssetId ? { audioAssetId } : {}),
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

  const handleSaveVideo = async () => {
    if (!generatedVideo || !generatedVideoRunId) return;
    const artifactId =
      typeof generatedVideo.metadata.artifactId === 'string' ? generatedVideo.metadata.artifactId : null;

    if (!artifactId) {
      setGenerationError('当前结果暂不支持保存到我的媒体。');
      return;
    }

    try {
      setGenerationError(null);
      setGenerationMessage('正在保存到我的媒体...');
      const result = await saveGeneratedMedia({
        runId: generatedVideoRunId,
        artifactId,
      });
      setGeneratedVideo((current) =>
        current
          ? {
              ...current,
              metadata: {
                ...current.metadata,
                ...result.artifact.metadata,
              },
            }
          : current,
      );
      setGenerationMessage('已保存到我的媒体，可在用户中心重复引用。');
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '保存媒体失败');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <Link href="/home" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-card shadow-sm">
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
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">登录后查看可用模型</div>
              ) : modelLoading ? (
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">视频配置加载中...</div>
              ) : configDisabledMessage ? (
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <p>{configDisabledMessage}</p>
                  {videoConfig.upgradeRequired ? (
                    <Link
                      href="/membership"
                      className="mt-2 inline-flex text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
                    >
                      查看会员权益
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setModelAvailability((current) => ({
                          ...current,
                          reloadKey: nextReloadKey(current.reloadKey),
                        }))
                      }
                      className="mt-2 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
                    >
                      重新加载配置
                    </button>
                  )}
                </div>
              ) : modelMaintenanceMessage ? (
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <p>{modelMaintenanceMessage}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setModelAvailability((current) => ({
                        ...current,
                        reloadKey: nextReloadKey(current.reloadKey),
                      }))
                    }
                    className="mt-2 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
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
                        selectedModel === model.id ? 'border-border bg-secondary' : 'border border-border bg-card hover:border-ring'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{model.name}</span>
                          {model.isDefault ? (
                            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">默认</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {model.providerName} · {model.entitlementLabel} · {model.pricingSummary}
                        </div>
                      </div>
                      <div className="flex h-5 w-5 items-center justify-center">
                        {selectedModel === model.id ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-border" />
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
                disabled={Boolean(configDisabledMessage)}
                className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring"
              />
            </div>

            {/* Style */}
            <div>
              <label className="mb-2 block text-sm font-medium">视频风格</label>
              <div className="flex flex-wrap gap-2">
                {videoConfig.styles.length > 0 ? videoConfig.styles.map((style) => (
                  <button
                    key={style.code}
                    type="button"
                    disabled={Boolean(configDisabledMessage)}
                    onClick={() => {
                      setSelectedStyleCode(style.code);
                      setPrompt(style.prompt);
                    }}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-all ${
                      selectedStyleCode === style.code ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground'
                    }`}
                  >
                    {style.name}
                  </button>
                )) : <p className="text-xs text-muted-foreground">暂无可用风格</p>}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="mb-2 block text-sm font-medium">时长</label>
              <div className="flex gap-2">
                {videoConfig.durations.length > 0 ? videoConfig.durations.map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    disabled={Boolean(configDisabledMessage)}
                    onClick={() => setDurationSeconds(duration)}
                    className={`cursor-pointer rounded-lg px-4 py-2 text-sm ${
                      durationSeconds === duration ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'
                    }`}
                  >
                    {duration}秒
                  </button>
                )) : <p className="text-xs text-muted-foreground">暂无可用时长</p>}
              </div>
            </div>

            {/* Clarity */}
            <div>
              <label className="mb-2 block text-sm font-medium">清晰度</label>
              <div className="flex gap-2">
                {videoConfig.resolutions.length > 0 ? videoConfig.resolutions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={Boolean(configDisabledMessage)}
                    onClick={() => setResolution(item.value)}
                    className={`cursor-pointer rounded-lg px-4 py-2 text-sm ${
                      resolution === item.value ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'
                    }`}
                  >
                    <div className="font-medium">{item.label}</div>
                  </button>
                )) : <p className="text-xs text-muted-foreground">暂无可用清晰度</p>}
              </div>
            </div>

            {/* Materials */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <ImageIcon size={15} className="text-muted-foreground" />
                  <span className="text-sm font-medium">参考图（可选）</span>
                </div>
                <label htmlFor="video-reference-image-input" className="sr-only">
                  上传参考图
                </label>
                <input
                  id="video-reference-image-input"
                  ref={imageFileInputRef}
                  type="file"
                  accept={IMAGE_UPLOAD_ACCEPT}
                  disabled={Boolean(configDisabledMessage) || isGenerating}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPendingImageFile(file);
                    if (file) setSelectedImageAssetId('');
                  }}
                  className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-foreground"
                />
                <label htmlFor="video-reference-image-asset" className="sr-only">
                  从媒体库选择参考图
                </label>
                <select
                  id="video-reference-image-asset"
                  value={selectedImageAssetId}
                  disabled={Boolean(configDisabledMessage) || isGenerating || pendingImageFile !== null}
                  onChange={(event) => selectImageAsset(event.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  <option value="">从媒体库选择</option>
                  {savedImageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{describeMediaAsset(asset)}</option>
                  ))}
                </select>
                {pendingImageFile ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">{pendingImageFile.name}</p>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={clearPendingImageFile}
                      aria-label="移除待上传参考图"
                      className="shrink-0 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      移除
                    </button>
                  </div>
                ) : null}
                {selectedImageAssetId ? (
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setSelectedImageAssetId('')}
                    aria-label="清除媒体库参考图选择"
                    className="mt-2 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    清除媒体库选择
                  </button>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Music size={15} className="text-muted-foreground" />
                  <span className="text-sm font-medium">音频（可选）</span>
                </div>
                <label htmlFor="video-audio-input" className="sr-only">
                  上传音频素材
                </label>
                <input
                  id="video-audio-input"
                  ref={audioFileInputRef}
                  type="file"
                  accept={AUDIO_UPLOAD_ACCEPT}
                  disabled={Boolean(configDisabledMessage) || isGenerating}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPendingAudioFile(file);
                    if (file) setSelectedAudioAssetId('');
                  }}
                  className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-foreground"
                />
                <label htmlFor="video-audio-asset" className="sr-only">
                  从媒体库选择音频素材
                </label>
                <select
                  id="video-audio-asset"
                  value={selectedAudioAssetId}
                  disabled={Boolean(configDisabledMessage) || isGenerating || pendingAudioFile !== null}
                  onChange={(event) => selectAudioAsset(event.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                >
                  <option value="">从媒体库选择</option>
                  {savedAudioAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{describeMediaAsset(asset)}</option>
                  ))}
                </select>
                {pendingAudioFile ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">{pendingAudioFile.name}</p>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={clearPendingAudioFile}
                      aria-label="移除待上传音频素材"
                      className="shrink-0 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      移除
                    </button>
                  </div>
                ) : null}
                {selectedAudioAssetId ? (
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setSelectedAudioAssetId('')}
                    aria-label="清除媒体库音频素材选择"
                    className="mt-2 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    清除媒体库选择
                  </button>
                ) : null}
              </div>
            </div>

            <button onClick={handleGenerate} disabled={isGenerating || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
              {isGenerating ? '生成中...' : '开始生成'}
            </button>
            {submitDisabledReason ? <p className="text-xs text-muted-foreground">{submitDisabledReason}</p> : null}
          </div>

          {/* Right - Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card/70 p-8">
            {generatedVideo ? (
              <div className="flex w-full flex-col items-center gap-4 text-center">
                <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
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
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <button onClick={handleDownloadVideo} className="apple-btn apple-btn-primary flex-1 cursor-pointer rounded-xl py-2.5 text-sm font-medium">
                    下载视频
                  </button>
                  <button
                    onClick={handleSaveVideo}
                    className="flex-1 cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:border-ring"
                  >
                    {generatedVideo.metadata.saveStatus === 'saved' ? '已保存到我的媒体' : '保存到我的媒体'}
                  </button>
                </div>
                <div className="w-full rounded-xl border border-warning/30 bg-warning-surface px-3 py-2 text-left text-xs leading-5 text-warning">
                  {generatedVideo.metadata.saveStatus === 'saved'
                    ? '生成结果已保存到我的媒体，可在用户中心或后续多模态对话中重复引用。'
                    : '生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。'}
                </div>
                {generationError ? (
                  <div className="w-full rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-xs leading-5 text-destructive">
                    {generationError}
                  </div>
                ) : null}
                {generationMessage ? <p className="text-xs text-muted-foreground">{generationMessage}</p> : null}
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                  <Film size={28} className="animate-pulse text-muted-foreground" />
                </div>
                <p className="mb-2 text-sm font-medium">Seedance 2.0 正在造梦...</p>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full animate-pulse rounded-full bg-primary/60" style={{ width: '60%' }} />
                </div>
              </div>
            ) : generationError ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                  <Play size={28} className="text-red-500" />
                </div>
                <p className="mb-1 text-sm font-medium text-red-500">生成失败</p>
                <p className="text-xs text-muted-foreground">{generationError}</p>
              </div>
            ) : generationMessage ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                  <Play size={28} className="text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">生成完成</p>
                <p className="text-xs text-muted-foreground">{generationMessage}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                  <Play size={28} className="text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">视频预览</p>
                <p className="text-xs text-muted-foreground">生成的视频将在此处展示</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
