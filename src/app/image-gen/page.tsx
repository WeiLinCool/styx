'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload, Wand2, ImageIcon, Sparkles, Layers, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  AgentRuntimeApiError,
  createAgentRun,
  createAgentRunEventsUrl,
  listImageModels,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
  selectImageModelId,
  type ImageModelMode,
  type ImageModelOption,
} from '@/features/public/agent-runtime-client';
import { styleOptions, toolSizes } from '@/features/public/tool-data';
import type { DirectMediaResultDto } from '@/server/agent/types';

const TABS = [
  { id: 'generate', name: 'AI生图', icon: Sparkles },
  { id: 'hd-fix', name: '高清修复', icon: Layers },
  { id: 'style-transfer', name: '图片换风格', icon: Wand2 },
] as const;

type ImageGenTabId = (typeof TABS)[number]['id'];

const tabModeById: Record<ImageGenTabId, ImageModelMode> = {
  generate: 'generate',
  'hd-fix': 'upscale',
  'style-transfer': 'edit',
};

const acceptedSourceImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxSourceImageFileBytes = 7 * 1024 * 1024;

type GeneratedImageResult = {
  artifact: DirectMediaResultDto;
  prompt: string;
};

type SourceImageState = {
  dataUrl: string;
  name: string;
  type: string;
  size: number;
};

type ModeLoadState = Record<ImageModelMode, boolean>;
type ModeErrorState = Record<ImageModelMode, string | null>;

export default function ImageGenPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [activeTab, setActiveTab] = useState<ImageGenTabId>('generate');
  const [prompt, setPrompt] = useState('');
  const [modelsByMode, setModelsByMode] = useState<Record<ImageModelMode, ImageModelOption[]>>({
    generate: [],
    edit: [],
    upscale: [],
  });
  const [selectedModelsByMode, setSelectedModelsByMode] = useState<Record<ImageModelMode, string | null>>({
    generate: null,
    edit: null,
    upscale: null,
  });
  const [modelsLoadingByMode, setModelsLoadingByMode] = useState<ModeLoadState>({
    generate: false,
    edit: false,
    upscale: false,
  });
  const [modelsErrorByMode, setModelsErrorByMode] = useState<ModeErrorState>({
    generate: null,
    edit: null,
    upscale: null,
  });
  const [selectedSize, setSelectedSize] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImageResult | null>(null);
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState('');
  const imageReceivedRunIdRef = useRef<string | null>(null);
  const [hdScale, setHdScale] = useState('2x');
  const [hdPrompt, setHdPrompt] = useState('高清修复，增强细节，提升画质，保留原始构图');
  const [selectedStyle, setSelectedStyle] = useState('stone-print');
  const [stylePrompt, setStylePrompt] = useState('');
  const [sourceImages, setSourceImages] = useState<Record<'upscale' | 'edit', SourceImageState | null>>({
    upscale: null,
    edit: null,
  });
  const hdFileInputRef = useRef<HTMLInputElement>(null);
  const styleFileInputRef = useRef<HTMLInputElement>(null);

  const activeMode = tabModeById[activeTab];
  const activeModels = modelsByMode[activeMode];
  const selectedModelId = selectedModelsByMode[activeMode];
  const selectedModel = activeModels.find((model) => model.id === selectedModelId) ?? null;
  const modelsLoading = modelsLoadingByMode[activeMode];
  const modelsError = modelsErrorByMode[activeMode];
  const activeSourceImage = activeMode === 'upscale' || activeMode === 'edit' ? sourceImages[activeMode] : null;

  useEffect(() => {
    setGeneratedImage(null);
    setGenerationMessage(null);
    setGenerationError(null);
  }, [activeTab]);

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setModelsByMode({ generate: [], edit: [], upscale: [] });
      setSelectedModelsByMode({ generate: null, edit: null, upscale: null });
      setModelsErrorByMode({ generate: null, edit: null, upscale: null });
      setModelsLoadingByMode({ generate: false, edit: false, upscale: false });
      return;
    }

    let cancelled = false;

    async function loadModelsForMode() {
      setModelsLoadingByMode((current) => ({ ...current, [activeMode]: true }));
      setModelsErrorByMode((current) => ({ ...current, [activeMode]: null }));

      try {
        const models = await listImageModels(activeMode);
        if (cancelled) return;

        setModelsByMode((current) => ({
          ...current,
          [activeMode]: models,
        }));
        setSelectedModelsByMode((current) => ({
          ...current,
          [activeMode]: selectImageModelId(models, current[activeMode]),
        }));
      } catch (error) {
        if (cancelled) return;
        setModelsByMode((current) => ({ ...current, [activeMode]: [] }));
        setSelectedModelsByMode((current) => ({ ...current, [activeMode]: null }));
        setModelsErrorByMode((current) => ({
          ...current,
          [activeMode]: readRuntimeErrorMessage(error, '图片模型列表加载失败'),
        }));
      } finally {
        if (!cancelled) {
          setModelsLoadingByMode((current) => ({ ...current, [activeMode]: false }));
        }
      }
    }

    void loadModelsForMode();

    return () => {
      cancelled = true;
    };
  }, [activeMode, isLoggedIn, user]);

  const submitDisabledReason = useMemo(() => {
    if (!isLoggedIn) return null;
    if (!user || requiresActivation(user)) return '账号激活后可使用';
    if (modelsLoading) return '模型列表加载中';
    if (modelsError) return modelsError;
    if (!selectedModelId) return '当前模式暂无可用模型';
    if ((activeMode === 'upscale' || activeMode === 'edit') && !activeSourceImage) {
      return '请先上传原图';
    }
    return null;
  }, [activeMode, activeSourceImage, isLoggedIn, modelsError, modelsLoading, selectedModelId, user]);

  const handleTabChange = (tabId: ImageGenTabId) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
  };

  const handleModelSelect = (modelId: string) => {
    setSelectedModelsByMode((current) => ({
      ...current,
      [activeMode]: modelId,
    }));
  };

  const readSourceImage = (mode: Extract<ImageModelMode, 'edit' | 'upscale'>, file: File) => {
    setGenerationMessage(null);
    setGenerationError(null);

    if (!acceptedSourceImageTypes.has(file.type)) {
      setSourceImages((current) => ({ ...current, [mode]: null }));
      setGenerationError('仅支持 PNG、JPEG 或 WebP 图片。');
      return;
    }

    if (file.size > maxSourceImageFileBytes) {
      setSourceImages((current) => ({ ...current, [mode]: null }));
      setGenerationError('图片过大，请上传 7 MiB 以内的图片。');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl.startsWith('data:image/')) {
        setSourceImages((current) => ({ ...current, [mode]: null }));
        setGenerationError('图片读取失败，请重新选择文件。');
        return;
      }

      setSourceImages((current) => ({
        ...current,
        [mode]: {
          dataUrl,
          name: file.name,
          type: file.type,
          size: file.size,
        },
      }));
    };
    reader.onerror = () => {
      setSourceImages((current) => ({ ...current, [mode]: null }));
      setGenerationError('图片读取失败，请重新选择文件。');
    };
    reader.readAsDataURL(file);
  };

  const handleSourceImageChange = (
    mode: Extract<ImageModelMode, 'edit' | 'upscale'>,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    readSourceImage(mode, file);
  };

  const clearSourceImage = (mode: Extract<ImageModelMode, 'edit' | 'upscale'>) => {
    setSourceImages((current) => ({ ...current, [mode]: null }));
    setGenerationMessage(null);
    setGenerationError(null);
  };

  useEffect(() => {
    if (!streamRunId) {
      return;
    }

    const eventSource = new EventSource(createAgentRunEventsUrl(streamRunId));
    eventSource.addEventListener('artifact_completed', (event) => {
      const payload = parseStreamEventPayload(event);
      const artifact = parseDirectMediaArtifactPayload(payload);
      if (!artifact || artifact.kind !== 'image') {
        return;
      }

      imageReceivedRunIdRef.current = streamRunId;
      setGeneratedImage({ artifact, prompt: submittedPrompt });
      setGenerationError(null);
      setGenerationMessage('图片已生成，请及时下载。');
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
          : '图片生成请求失败';
      setGenerationError(failureMessage);
      setIsGenerating(false);
      eventSource.close();
      setStreamRunId((current) => (current === streamRunId ? null : current));
    });
    eventSource.onerror = () => {
      eventSource.close();
      setIsGenerating(false);
      setStreamRunId((current) => (current === streamRunId ? null : current));
      if (imageReceivedRunIdRef.current !== streamRunId) {
        setGenerationError('图片生成连接中断，请重试。');
      }
    };

    return () => {
      eventSource.close();
    };
  }, [streamRunId, submittedPrompt]);

  const handleGenerate = async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    if (isGenerating) return;

    const promptByTab = {
      generate: prompt,
      'hd-fix': hdPrompt,
      'style-transfer': stylePrompt || `转换为 ${styleOptions.find((style) => style.id === selectedStyle)?.name ?? selectedStyle} 风格`,
    };

    const runPrompt = promptByTab[activeTab as keyof typeof promptByTab]?.trim();
    if (!runPrompt) {
      setGenerationMessage(null);
      setGenerationError('请输入提示词后再开始生成。');
      return;
    }
    if (!selectedModelId) {
      setGenerationMessage(null);
      setGenerationError(modelsLoading ? '模型列表加载中' : '当前模式暂无可用模型');
      return;
    }
    if ((activeMode === 'upscale' || activeMode === 'edit') && !activeSourceImage) {
      setGenerationMessage(null);
      setGenerationError('请先上传原图。');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationMessage(null);
    setGeneratedImage(null);
    setSubmittedPrompt(runPrompt);
    imageReceivedRunIdRef.current = null;

    try {
      const { run } = await createAgentRun({
        taskType: 'image',
        prompt: runPrompt,
        modelId: selectedModelId,
        input: {
          mode: activeMode,
          size: selectedSize,
          scale: activeMode === 'upscale' ? hdScale : undefined,
          style: selectedStyle,
          sourceImageDataUrl: activeSourceImage?.dataUrl,
        },
      });
      if (run.status === 'failed') {
        setGenerationError(run.errorMessage ?? '图片生成请求失败');
        setIsGenerating(false);
        return;
      }

      if (run.status !== 'running') {
        setGenerationError(run.errorMessage ?? '图片生成请求未进入运行状态，请重试。');
        setIsGenerating(false);
        return;
      }

      setStreamRunId(run.id);
      setGenerationMessage('任务已提交，正在等待模型返回结果。');
    } catch (error) {
      setGenerationError(readRuntimeErrorMessage(error, '图片生成请求失败'));
      setIsGenerating(false);
    }
  };

  const handleDownloadImage = () => {
    if (!generatedImage) return;
    try {
      const link = document.createElement('a');
      link.href = generatedImage.artifact.delivery.url;
      link.download =
        typeof generatedImage.artifact.metadata.filename === 'string'
          ? generatedImage.artifact.metadata.filename
          : 'styx-ai-image.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setGenerationError('下载未能自动开始，请在图片上右键另存为。');
    }
  };

  const handleCopyPrompt = async () => {
    if (!generatedImage) return;
    try {
      await navigator.clipboard.writeText(generatedImage.prompt);
      setGenerationMessage('提示词已复制。图片不会保存到服务器，请及时下载。');
    } catch {
      setGenerationError('提示词复制失败，请手动复制输入框内容。');
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/home" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
                <svg width="12" height="12" viewBox="0 0 40 40" fill="none"><path d="M20 4L8 12V28L20 36L32 28V12L20 4Z" fill="black" /><circle cx="20" cy="20" r="4" fill="white" /></svg>
              </div>
              <span className="text-sm font-semibold">AI生图</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn && user ? (
              <UserAvatar avatar={user.avatar} size={24} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
            ) : (
              <button onClick={openLoginModal} className="apple-btn apple-btn-primary cursor-pointer rounded-full px-3 py-1 text-xs">登录</button>
            )}
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="border-b border-black/5">
        <div className="mx-auto flex max-w-7xl gap-1 px-4 py-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-black/5 text-[#1d1d1f]'
                  : 'text-[#444444] hover:text-[#555555]'
              }`}
            >
              <tab.icon size={14} />
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        {isLoggedIn && user && requiresActivation(user) ? (
          <ProtectedAccountPanel accountState={user.accountState} title="激活账号后使用 AI 生图" />
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left - Controls */}
          <div className="space-y-6">
            {activeTab === 'generate' && (
              <>
                {/* Prompt */}
                <div>
                  <label className="mb-2 block text-sm font-medium">提示词</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="描述你想生成的图片..."
                    rows={4}
                    className="w-full resize-none rounded-xl border border-black/8 bg-white/[0.03] px-4 py-3 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none transition-colors focus:border-black/10"
                  />
                </div>
                {/* Model */}
                <div>
                  <label className="mb-2 block text-sm font-medium">模型选择</label>
                  <ModelOptions
                    models={activeModels}
                    selectedModelId={selectedModelId}
                    loading={modelsLoading}
                    error={modelsError}
                    onSelect={handleModelSelect}
                  />
                </div>
                {/* Size */}
                <div>
                  <label className="mb-2 block text-sm font-medium">图片尺寸</label>
                  <div className="flex gap-2">
                    {toolSizes.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setSelectedSize(s.label)}
                        className={`cursor-pointer rounded-lg px-4 py-2 text-sm transition-all ${
                          selectedSize === s.label ? 'bg-white text-black' : 'border border-black/8 text-[#555555] hover:border-black/10'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleGenerate} disabled={isGenerating || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                  {isGenerating ? '生成中...' : '开始生成'}
                </button>
                {submitDisabledReason ? <p className="text-xs text-[#6e6e73]">{submitDisabledReason}</p> : null}
              </>
            )}

            {activeTab === 'hd-fix' && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium">上传图片</label>
                  <input ref={hdFileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleSourceImageChange('upscale', event)} />
                  <SourceImagePicker
                    sourceImage={sourceImages.upscale}
                    onPick={() => hdFileInputRef.current?.click()}
                    onClear={() => clearSourceImage('upscale')}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">修复模型</label>
                  <ModelOptions
                    models={activeModels}
                    selectedModelId={selectedModelId}
                    loading={modelsLoading}
                    error={modelsError}
                    onSelect={handleModelSelect}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">放大倍数</label>
                  <div className="flex gap-2">
                    {['2x', '4x'].map((s) => (
                      <button key={s} onClick={() => setHdScale(s)} className={`cursor-pointer rounded-lg px-4 py-2 text-sm ${hdScale === s ? 'bg-white text-black' : 'border border-black/8 text-[#555555]'}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">修复提示词</label>
                  <textarea value={hdPrompt} onChange={(e) => setHdPrompt(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-black/8 bg-white/[0.03] px-4 py-3 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none focus:border-black/10" />
                </div>
                <button onClick={handleGenerate} disabled={isGenerating || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                  {isGenerating ? '修复中...' : '开始修复'}
                </button>
                {submitDisabledReason ? <p className="text-xs text-[#6e6e73]">{submitDisabledReason}</p> : null}
              </>
            )}

            {activeTab === 'style-transfer' && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium">上传图片</label>
                  <input ref={styleFileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleSourceImageChange('edit', event)} />
                  <SourceImagePicker
                    sourceImage={sourceImages.edit}
                    onPick={() => styleFileInputRef.current?.click()}
                    onClear={() => clearSourceImage('edit')}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">编辑模型</label>
                  <ModelOptions
                    models={activeModels}
                    selectedModelId={selectedModelId}
                    loading={modelsLoading}
                    error={modelsError}
                    onSelect={handleModelSelect}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">选择风格</label>
                  <div className="grid grid-cols-4 gap-2">
                    {styleOptions.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl py-3 transition-all ${
                          selectedStyle === style.id ? 'bg-black/5 border border-black/10' : 'border border-black/5 hover:border-black/8'
                        }`}
                      >
                        <span className="text-xl">{style.preview}</span>
                        <span className="text-[10px] text-[#555555]">{style.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">附加提示词</label>
                  <textarea value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} placeholder="可选：添加额外的风格描述..." rows={2} className="w-full resize-none rounded-xl border border-black/8 bg-white/[0.03] px-4 py-3 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none focus:border-black/10" />
                </div>
                <button onClick={handleGenerate} disabled={isGenerating || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                  {isGenerating ? '转换中...' : '开始换风格'}
                </button>
                {submitDisabledReason ? <p className="text-xs text-[#6e6e73]">{submitDisabledReason}</p> : null}
              </>
            )}
          </div>

          {/* Right - Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white/[0.02] p-8">
            {generatedImage ? (
              <div className="flex w-full flex-col items-center gap-4 text-center">
                <div className="w-full overflow-hidden rounded-xl border border-black/5 bg-[#f5f5f7]">
                  <img
                    src={generatedImage.artifact.delivery.url}
                    alt={generatedImage.artifact.title}
                    className="max-h-[520px] w-full rounded-xl object-contain"
                  />
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <button onClick={handleDownloadImage} className="apple-btn apple-btn-primary flex-1 cursor-pointer rounded-xl py-2.5 text-sm font-medium">
                    下载图片
                  </button>
                  <button onClick={handleCopyPrompt} className="cursor-pointer rounded-xl border border-black/8 px-4 py-2.5 text-sm text-[#1d1d1f] transition-colors hover:border-black/15">
                    复制提示词
                  </button>
                </div>
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-800">
                  生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。
                </div>
                {generationMessage ? <p className="text-xs text-[#444444]">{generationMessage}</p> : null}
                {selectedModel ? <p className="text-xs text-[#6e6e73]">模型：{selectedModel.name}</p> : null}
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-black/8 border-t-white" />
                <p className="text-sm text-[#444444]">AI 正在创作中...</p>
              </div>
            ) : generationError ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                  <ImageIcon size={28} className="text-red-500" />
                </div>
                <p className="mb-1 text-sm font-medium text-red-500">生成失败</p>
                <p className="text-xs text-[#444444]">{generationError}</p>
              </div>
            ) : generationMessage ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
                  <ImageIcon size={28} className="text-[#444444]" />
                </div>
                <p className="mb-1 text-sm font-medium text-[#555555]">生成完成</p>
                <p className="text-xs text-[#444444]">{generationMessage}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
                  <ImageIcon size={28} className="text-[#444444]" />
                </div>
                <p className="mb-1 text-sm font-medium text-[#555555]">预览区域</p>
                <p className="text-xs text-[#444444]">生成的图片将在此处展示</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelOptions({
  models,
  selectedModelId,
  loading,
  error,
  onSelect,
}: {
  models: ImageModelOption[];
  selectedModelId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (modelId: string) => void;
}) {
  if (loading) {
    return <div className="rounded-xl border border-black/5 px-4 py-3 text-sm text-[#444444]">模型加载中...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>;
  }

  if (models.length === 0) {
    return <div className="rounded-xl border border-black/5 px-4 py-3 text-sm text-[#444444]">当前模式暂无可用模型</div>;
  }

  return (
    <div className="space-y-1.5">
      {models.map((model) => (
        <button
          key={model.id}
          onClick={() => onSelect(model.id)}
          className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left transition-all ${
            selectedModelId === model.id ? 'bg-black/5 border border-black/10' : 'border border-black/5 hover:border-black/8'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{model.name}</span>
              {model.isDefault ? <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-[#444444]">默认</span> : null}
            </div>
            <div className="text-xs text-[#444444]">{model.providerName} · {model.entitlementLabel} · {model.pricingSummary}</div>
          </div>
          <div className="flex h-5 w-5 items-center justify-center">
            {selectedModelId === model.id ? (
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
  );
}

function SourceImagePicker({
  sourceImage,
  onPick,
  onClear,
}: {
  sourceImage: SourceImageState | null;
  onPick: () => void;
  onClear: () => void;
}) {
  if (sourceImage) {
    return (
      <div className="rounded-xl border border-black/8 p-3">
        <div className="mb-3 overflow-hidden rounded-lg bg-[#f5f5f7]">
          <img src={sourceImage.dataUrl} alt={sourceImage.name} className="max-h-64 w-full object-contain" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{sourceImage.name}</p>
            <p className="text-xs text-[#6e6e73]">{formatBytes(sourceImage.size)} · {sourceImage.type}</p>
          </div>
          <button type="button" onClick={onClear} className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/8 text-[#444444] hover:border-black/15" aria-label="清除图片">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={onPick} className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-black/8 py-12 transition-colors hover:border-black/10">
      <div className="text-center">
        <Upload size={24} className="mx-auto mb-2 text-[#444444]" />
        <p className="text-sm text-[#444444]">点击上传 PNG、JPEG 或 WebP</p>
        <p className="mt-1 text-xs text-[#6e6e73]">最大 7 MiB</p>
      </div>
    </button>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KiB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function readRuntimeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AgentRuntimeApiError) {
    if (error.code === 'insufficient_credits') {
      return '积分不足，无法使用当前模型';
    }
    if (error.code === 'model_entitlement_required') {
      return '当前账号无权使用所选模型';
    }
    if (error.code === 'model_not_available') {
      return '所选模型不可用，请切换模型后重试';
    }
    if (error.code === 'provider_unconfigured') {
      return '模型服务暂未配置，请稍后再试';
    }
    if (error.code === 'provider_error') {
      return '模型服务请求失败，请稍后再试';
    }
    return error.message;
  }

  return error instanceof Error ? error.message : fallback;
}
