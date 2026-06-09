'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  createAgentRun,
  filterStoryboardTemplateImageModels,
  getAgentRunDetail,
  getGeneratedRunArtifactAccess,
  getSavedMediaAssetAccess,
  listAgentRuns,
  listImageModels,
  saveGeneratedMedia,
  syncAgentRun,
  getVideoGenerationConfig,
  selectImageModelId,
  uploadUserMedia,
  type VideoGenerationConfigDto,
  type ImageModelMode,
  type ImageModelOption,
  type WorkflowSceneBackgroundOption,
  type VideoModelOption,
} from '@/features/public/agent-runtime-client';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
} from '@/features/public/model-availability';
import {
  applyGeneratedWorkflowImage,
  createWorkflowVideoRestoreSnapshot,
  isWorkflowVideoHistoryRun,
  parseWorkflowDraftSnapshot,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
  resolveWorkflowVideoMaterialReadiness,
  resolveWorkflowVideoSelections,
  resolveWorkflowVideoModelAvailability,
  resolveWorkflowSceneStepDreamAction,
  resolveWorkflowUploadStepNextAction,
  shouldContinueWorkflowVideoSync,
  syncWorkflowVideoRunUntilTerminal,
  type WorkflowStateSnapshot,
} from './workflow-state';
import type {
  AgentArtifactDto,
  AgentRunDto,
} from '@/server/agent/types';
import {
  ImageGenerationDialog,
  PromptOptimizationDialog,
  waitForTerminalRun,
} from './workflow-quick-action-dialogs';
import {
  ArrowLeft,
  Upload,
  Wand2,
  ChevronRight,
  Check,
  Film,
  User,
  Menu,
  X,
  Workflow,
  Sparkles,
  RefreshCw,
  Zap,
  Crown,
  Mountain,
  Loader2,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import UserAvatar from '@/components/user-avatar';

// 默认提示词
const DEFAULT_PROMPT = '石头印画风格，将图案转化为石纹肌理效果，保留原始构图，增添天然石纹质感和裂缝光影细节，色调温暖沉稳，边缘自然风化，背景深色石板';
const WORKFLOW_DRAFT_STORAGE_KEY = 'lingwei.workflow-video-mvp.draft.v1';
const WORKFLOW_VIDEO_SYNC_INTERVAL_MS = 3000;
const WORKFLOW_VIDEO_SYNC_MAX_ATTEMPTS = 120;

type WorkflowModelCard = {
  id: string;
  name: string;
  desc: string;
  badge: string | null;
  badgeColor: string;
  vip: boolean;
  logo: string;
  logoBg: string;
};

type WorkflowImageModelCard = WorkflowModelCard & {
  supportedModes: ImageModelMode[];
};

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
  workflowSceneBackgrounds: [],
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatHistoryTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function firstMediaArtifact(run: AgentRunDto, kind: 'image' | 'video'): AgentArtifactDto | null {
  return run.artifacts.find((artifact) => artifact.kind === kind && artifact.status === 'ready') ?? null;
}

function buildWorkflowStateSnapshot(input: WorkflowStateSnapshot): WorkflowStateSnapshot {
  return input;
}

function decorateVideoModel(model: VideoModelOption): WorkflowModelCard {
  const signature = `${model.code} ${model.name}`.toLowerCase();
  const isFast = signature.includes('fast');
  const isSeedance = signature.includes('seedance');
  const isPremium = /vip|pro|会员/i.test(model.entitlementLabel);

  return {
    id: model.id,
    name: model.name,
    desc: `${model.providerName} · ${model.pricingSummary}`,
    badge: model.isDefault ? '默认' : isSeedance ? 'New' : null,
    badgeColor: model.isDefault ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white',
    vip: isPremium,
    logo: isFast ? '⚡' : isSeedance ? '🎬' : '🎥',
    logoBg: isFast ? 'bg-green-50' : isPremium ? 'bg-amber-50' : 'bg-red-50',
  };
}

function decorateImageModel(model: ImageModelOption): WorkflowImageModelCard {
  const signature = `${model.code} ${model.name}`.toLowerCase();
  const isPremium = /vip|pro|会员|midjourney|flux/i.test(signature) || /vip|pro|会员/i.test(model.entitlementLabel);
  const supportsGenerate = model.supportedModes.includes('generate');
  const supportsEdit = model.supportedModes.includes('edit');
  const supportsUpscale = model.supportedModes.includes('upscale');
  const isDefault = model.isDefault;

  return {
    id: model.id,
    name: model.name,
    desc:
      model.supportedModes.length === 3
        ? `${model.providerName} · 支持生图 / 风格 / 修复`
        : model.supportedModes.includes('generate') && model.supportedModes.includes('edit')
          ? `${model.providerName} · 支持生图 / 风格`
          : model.supportedModes.includes('generate') && model.supportedModes.includes('upscale')
            ? `${model.providerName} · 支持生图 / 修复`
            : `${model.providerName} · ${model.pricingSummary}`,
    badge: isDefault ? '默认' : supportsGenerate && supportsEdit && supportsUpscale ? '全能' : supportsUpscale ? '修复' : supportsEdit ? '风格' : null,
    badgeColor: isDefault ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white',
    vip: isPremium,
    logo: supportsGenerate ? '🤖' : supportsEdit ? '🎨' : supportsUpscale ? '⚡' : '🖼️',
    logoBg: supportsGenerate ? 'bg-green-50' : supportsEdit ? 'bg-purple-50' : supportsUpscale ? 'bg-yellow-50' : 'bg-slate-50',
    supportedModes: model.supportedModes,
  };
}

// 导航栏
function WorkflowNav() {
  const { user, isLoggedIn } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft size={18} />
            <span className="hidden text-sm sm:inline">返回首页</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
              <Workflow size={14} className="text-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">AI视频工作流</span>
          </div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          {isLoggedIn && user ? (
            <Link 
              href="/user-center" 
              className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-secondary/50 cursor-pointer"
            >
              <UserAvatar
                avatar={user.avatar}
                size={28}
                userLevel={user.userLevel}
              />
              <span className="text-xs text-foreground">{user.nickname}</span>
            </Link>
          ) : (
            <Link href="/home" className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-foreground backdrop-blur-md transition-all hover:bg-secondary">
              登录
            </Link>
          )}
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="cursor-pointer text-foreground sm:hidden">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </nav>
  );
}

// 上传图案区域
function PatternUploadZone({ uploadedImage, onUpload }: { uploadedImage: string | null; onUpload: (dataUrl: string, file: File | null) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') onUpload(result, file);
    };
    reader.readAsDataURL(file);
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFile(file);
  }, [handleFile]);

  const openFilePicker = useCallback(() => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.value = '';
    inputRef.current.click();
  }, []);

  if (uploadedImage) {
    return (
      <div className="space-y-3">
        <input ref={inputRef} id="pattern-upload" type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-2">
          <img src={uploadedImage} alt="已上传图案" className="mx-auto max-h-72 object-contain" />
          <div className="absolute top-3 right-3">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <Check size={12} />
              已上传
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={openFilePicker}
            className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <RefreshCw size={12} />
            重新上传
          </button>
          <button
            type="button"
            onClick={() => onUpload('', null)}
            className="transition-colors hover:text-foreground"
          >
            清空
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all ${
        dragOver ? 'border-ring bg-secondary/70' : 'border-border bg-card hover:border-ring'
      }`}
      onClick={openFilePicker}
    >
      <input ref={inputRef} id="pattern-upload" type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary">
        <Upload size={28} className="text-muted-foreground" />
      </div>
      <p className="mb-2 text-base font-medium text-foreground">拖拽图案到此处或点击上传</p>
      <p className="text-sm text-muted-foreground">支持 JPG、PNG 格式的石头印画图案</p>
    </div>
  );
}

// 模型选择器（通用）
function ModelSelector({ models, selectedModel, onSelect, title, icon: Icon }: {
  models: WorkflowModelCard[];
  selectedModel: string | null;
  onSelect: (id: string) => void;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon size={14} className="text-muted-foreground" />
        {title}
      </div>
      <div className="space-y-2">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelect(model.id)}
            className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all ${
              selectedModel === model.id
                ? 'border-border bg-secondary shadow-sm'
                : 'border-border bg-card hover:border-ring hover:shadow-sm'
            }`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${model.logoBg} ${selectedModel === model.id ? 'ring-1 ring-black/10' : ''}`}>
              {model.logo}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{model.name}</span>
                {model.badge && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${model.badgeColor}`}>
                    {model.badge}
                  </span>
                )}
                {model.vip && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Crown size={10} />
                    VIP
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{model.desc}</p>
            </div>
            {selectedModel === model.id && (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f]">
                <Check size={12} className="text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// 12宫格分镜图（单张图）
function StoryboardSingleImage({ generating, generated, imageUrl, modelName, onCancel, onRegenerate, onNext }: {
  generating: boolean;
  generated: boolean;
  imageUrl: string | null;
  modelName: string;
  onCancel: () => void;
  onRegenerate: () => void;
  onNext: () => void;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (generating) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) { clearInterval(interval); return 100; }
          return prev + 1;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [generating]);

  if (generating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/80 p-4 backdrop-blur-md">
          <Loader2 size={20} className="animate-spin text-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">正在为您生成12宫格分镜图</p>
            <p className="text-xs text-muted-foreground">{modelName} 正在创作中...</p>
          </div>
        </div>

        {/* 单张分镜图生成中 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative aspect-[4/3] w-full">
            {/* 渐现效果 - 从左到右逐渐显现 */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#f5f5f7] to-[#ebebed] transition-opacity duration-1000"
              style={{ opacity: progress / 100 }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              {progress < 100 ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={28} className="animate-spin text-foreground/30" />
                  <span className="text-xs text-muted-foreground">{progress}%</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Film size={32} className="text-foreground/40" />
                  <span className="text-sm font-medium text-foreground/60">分镜图</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">生成进度</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button onClick={onCancel} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground">
          <XCircle size={14} />
          取消生成
        </button>
      </div>
    );
  }

  if (generated) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-success-surface p-3 backdrop-blur-md">
          <Check size={16} className="text-success" />
          <span className="text-sm font-medium text-foreground">12宫格分镜图已生成</span>
          <span className="ml-auto text-xs text-muted-foreground">{modelName}</span>
        </div>

        {/* 单张分镜图 - 整体展示 */}
        <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-[#f5f5f7] to-[#ebebed]">
            {imageUrl ? (
              <img src={imageUrl} alt="12宫格分镜图" className="h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <Film size={40} className="text-foreground/30" />
                  <span className="text-sm font-medium text-foreground/50">12宫格分镜图</span>
                  <span className="text-xs text-muted-foreground">由 {modelName} 生成</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">整张分镜图由 {modelName} 一次生成</p>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button onClick={onRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm text-muted-foreground transition-all hover:border-ring hover:text-foreground">
            <RefreshCw size={14} />
            重新生成
          </button>
          <button onClick={onNext} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/85">
            下一步
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// 场景选择
function SceneSelector({
  backgrounds,
  selectedBackgroundId,
  loading,
  unavailableMessage,
  dreamAction,
  onSelectBackground,
  onProceedToDreamStep,
  onViewHistoryVideo,
}: {
  backgrounds: WorkflowSceneBackgroundOption[];
  selectedBackgroundId: string | null;
  loading: boolean;
  unavailableMessage: string | null;
  dreamAction: { label: string; description: string | null; viewHistoryVideoLabel: string | null };
  onSelectBackground: (id: string) => void;
  onProceedToDreamStep: () => void;
  onViewHistoryVideo: () => void;
}) {
  const selectedBackground = backgrounds.find((background) => background.id === selectedBackgroundId) ?? null;

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 size={22} className="mb-3 animate-spin" />
          官网背景加载中...
        </div>
      ) : backgrounds.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {backgrounds.map((background) => {
            const selected = background.id === selectedBackgroundId;
            return (
              <button
                key={background.id}
                type="button"
                onClick={() => onSelectBackground(background.id)}
                className={`group overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-ring ${
                  selected ? 'border-primary shadow-sm ring-2 ring-primary/20' : 'border-border'
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                  <img
                    src={background.publicUrl}
                    alt={background.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  {selected ? (
                    <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-sm">
                      <Check size={11} />
                      已选择
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 p-3">
                  <div className="line-clamp-1 text-sm font-medium text-foreground">{background.name}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{background.styleName}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center">
          <Mountain size={28} className="mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">暂无可用官网背景</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {unavailableMessage ?? '请联系管理员在工作流视频能力中启用官网背景图。'}
          </p>
        </div>
      )}

      {selectedBackground ? (
        <div className="space-y-2 pt-2">
          {dreamAction.description ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {dreamAction.description}
            </div>
          ) : null}
          <div className="flex gap-3">
            {dreamAction.viewHistoryVideoLabel ? (
              <button
                type="button"
                onClick={onViewHistoryVideo}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground transition-all hover:border-ring"
              >
                {dreamAction.viewHistoryVideoLabel}
                <ChevronRight size={14} />
              </button>
            ) : null}
            <button onClick={onProceedToDreamStep} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/85">
              {dreamAction.label}
              <Sparkles size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 造梦生成界面
function DreamGeneration({ videoModel }: { videoModel: string }) {
  const [dreamProgress, setDreamProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDreamProgress((prev) => { if (prev >= 100) { clearInterval(interval); return 100; } return prev + 0.5; });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/80 backdrop-blur-md">
        <div className="flex aspect-video flex-col items-center justify-center p-8">
          <div className="relative mb-4 h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-secondary border-t-primary" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Film size={24} className="text-foreground" />
            </div>
          </div>
          <p className="text-lg font-semibold text-foreground">{videoModel || '视频模型'} 正在造梦</p>
          <p className="mt-1 text-sm text-muted-foreground">AI视频生成中，请稍候...</p>
          <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dreamProgress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{Math.round(dreamProgress)}%</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm text-muted-foreground hover:border-ring">
          <XCircle size={14} /> 取消
        </button>
      </div>
    </div>
  );
}

// 主页面
export default function WorkflowPage() {
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [step, setStep] = useState(0); // 0: upload, 1: storyboard, 2: scene, 3: dream
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([]);
  const [selectedImageModel, setSelectedImageModel] = useState<string | null>(null);
  const [imageModelAvailability, setImageModelAvailability] = useState(createInitialModelAvailabilityState());
  const [videoConfig, setVideoConfig] = useState<VideoGenerationConfigDto>(emptyVideoConfig);
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [selectedVideoModel, setSelectedVideoModel] = useState<string | null>(null);
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState<number | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<string | null>(null);
  const [videoConfigLoaded, setVideoConfigLoaded] = useState(false);
  const [videoModelAvailability, setVideoModelAvailability] = useState(createInitialModelAvailabilityState());
  const [storyboardGenerating, setStoryboardGenerating] = useState(false);
  const [storyboardGenerated, setStoryboardGenerated] = useState(false);
  const [storyboardImageUrl, setStoryboardImageUrl] = useState<string | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [sourceImageAssetId, setSourceImageAssetId] = useState<string | null>(null);
  const [storyboardRunId, setStoryboardRunId] = useState<string | null>(null);
  const [storyboardArtifactId, setStoryboardArtifactId] = useState<string | null>(null);
  const [storyboardAssetId, setStoryboardAssetId] = useState<string | null>(null);
  const [selectedSceneBackgroundId, setSelectedSceneBackgroundId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [dreaming, setDreaming] = useState(false);
  const [dreamRunId, setDreamRunId] = useState<string | null>(null);
  const [dreamVideoUrl, setDreamVideoUrl] = useState<string | null>(null);
  const [dreamVideoArtifactId, setDreamVideoArtifactId] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [workflowHistoryRuns, setWorkflowHistoryRuns] = useState<AgentRunDto[]>([]);
  const [selectedWorkflowHistoryRunId, setSelectedWorkflowHistoryRunId] = useState<string | null>(null);
  const [workflowHistoryLoading, setWorkflowHistoryLoading] = useState(false);
  const [workflowHistoryError, setWorkflowHistoryError] = useState<string | null>(null);
  const [uploadedImageOrigin, setUploadedImageOrigin] = useState<'manual' | 'generated' | null>(null);
  const [pendingGeneratedImage, setPendingGeneratedImage] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [imageGenerationDialogOpen, setImageGenerationDialogOpen] = useState(false);
  const [draftPersistenceReady, setDraftPersistenceReady] = useState(false);
  const storyboardOperationRef = useRef(0);
  const dreamOperationRef = useRef(0);
  const selectedImageModelRef = useRef<string | null>(null);
  const selectedVideoModelRef = useRef<string | null>(null);
  const draftHydratedRef = useRef(false);
  const sourceUploadOperationRef = useRef(0);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;
  const decoratedImageModels = imageModels.map(decorateImageModel);
  const currentImageModel = decoratedImageModels.find((model) => model.id === selectedImageModel) ?? null;
  const decoratedVideoModels = videoModels.map(decorateVideoModel);
  const currentVideoModel = decoratedVideoModels.find((model) => model.id === selectedVideoModel) ?? null;
  const imageModelLoading = imageModelAvailability.status === 'loading';
  const imageModelUnavailableMessage =
    imageModelAvailability.status === 'maintenance'
      ? imageModelAvailability.message ?? buildUnavailableModelMessage()
      : null;
  const videoModelLoading = videoModelAvailability.status === 'loading';
  const videoModelUnavailableMessage =
    videoModelAvailability.status === 'maintenance' ? videoModelAvailability.message ?? buildUnavailableModelMessage() : null;
  const videoModelPlaceholderMessage =
    videoModelAvailability.status === 'unauthenticated'
      ? videoModelAvailability.message
      : videoModelUnavailableMessage;
  const workflowSceneBackgrounds = videoConfig.workflowSceneBackgrounds;
  const selectedWorkflowSceneBackground = workflowSceneBackgrounds.find(
    (background) => background.id === selectedSceneBackgroundId,
  ) ?? null;

  useEffect(() => {
    selectedVideoModelRef.current = selectedVideoModel;
  }, [selectedVideoModel]);

  useEffect(() => {
    selectedImageModelRef.current = selectedImageModel;
  }, [selectedImageModel]);

  useEffect(() => {
    if (draftHydratedRef.current || typeof window === 'undefined') {
      return;
    }
    draftHydratedRef.current = true;

    let rawDraft: string | null = null;
    try {
      rawDraft = window.localStorage.getItem(WORKFLOW_DRAFT_STORAGE_KEY);
    } catch {
      setDraftPersistenceReady(true);
      return;
    }
    if (!rawDraft) {
      setDraftPersistenceReady(true);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDraft);
    } catch {
      try {
        window.localStorage.removeItem(WORKFLOW_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage cleanup failures; the workflow can continue without drafts.
      }
      setDraftPersistenceReady(true);
      return;
    }

    const draft = parseWorkflowDraftSnapshot(parsed);
    if (!draft) {
      try {
        window.localStorage.removeItem(WORKFLOW_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage cleanup failures; the workflow can continue without drafts.
      }
      setDraftPersistenceReady(true);
      return;
    }

    setStep(draft.step);
    setUploadedImage(draft.uploadedImage);
    setUploadedImageOrigin(draft.uploadedImageOrigin);
    setUploadedImageFile(null);
    setSourceImageAssetId(draft.sourceImageAssetId);
    setSelectedImageModel(draft.selectedImageModel);
    setStoryboardGenerated(draft.storyboardGenerated);
    setStoryboardGenerating(false);
    setStoryboardImageUrl(draft.storyboardImageUrl);
    setStoryboardRunId(draft.storyboardRunId);
    setStoryboardArtifactId(draft.storyboardArtifactId);
    setStoryboardAssetId(draft.storyboardAssetId);
    setSelectedSceneBackgroundId(draft.selectedSceneBackgroundId);
    setPrompt(draft.prompt || DEFAULT_PROMPT);
    setSelectedVideoModel(draft.selectedVideoModel);
    setSelectedDurationSeconds(draft.selectedDurationSeconds);
    setSelectedResolution(draft.selectedResolution);
    setDreaming(false);
    setDreamRunId(draft.dreamRunId);
    setDreamVideoUrl(draft.dreamVideoUrl);
    setDreamVideoArtifactId(draft.dreamVideoArtifactId);

    if (!draft.uploadedImage && draft.sourceImageAssetId) {
      void getSavedMediaAssetAccess(draft.sourceImageAssetId, 'preview')
        .then((access) => setUploadedImage(access.url))
        .catch(() => setRuntimeError('已恢复工作流草稿，但原图预览暂时不可用。'));
    }
    setDraftPersistenceReady(true);
  }, []);

  useEffect(() => {
    if (!draftPersistenceReady || typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKFLOW_DRAFT_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          step,
          uploadedImage: uploadedImageOrigin === 'manual' ? null : uploadedImage,
          uploadedImageOrigin,
          sourceImageAssetId,
          selectedImageModel,
          storyboardGenerated,
          storyboardImageUrl,
          storyboardRunId,
          storyboardArtifactId,
          storyboardAssetId,
          selectedSceneBackgroundId,
          prompt,
          selectedVideoModel,
          selectedDurationSeconds,
          selectedResolution,
          dreamRunId,
          dreamVideoUrl,
          dreamVideoArtifactId,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Draft persistence is best-effort and should not block generation.
    }
  }, [
    draftPersistenceReady,
    dreamRunId,
    dreamVideoArtifactId,
    dreamVideoUrl,
    prompt,
    selectedDurationSeconds,
    selectedImageModel,
    selectedResolution,
    selectedSceneBackgroundId,
    selectedVideoModel,
    sourceImageAssetId,
    step,
    storyboardArtifactId,
    storyboardAssetId,
    storyboardGenerated,
    storyboardImageUrl,
    storyboardRunId,
    uploadedImage,
    uploadedImageOrigin,
  ]);

  useEffect(() => {
    if (!isLoggedIn || activationRequired) {
      setImageModels([]);
      setSelectedImageModel(null);
      setImageModelAvailability(createInitialModelAvailabilityState());
      return;
    }

    let cancelled = false;
    setImageModelAvailability((current) => ({
      ...current,
      status: 'loading',
      message: null,
    }));

    void listImageModels('edit')
      .then((models) => {
        if (cancelled) {
          return;
        }

        const workflowModels = filterStoryboardTemplateImageModels(models);
        setImageModels(workflowModels);
        setSelectedImageModel(selectImageModelId(workflowModels, selectedImageModelRef.current));
        setImageModelAvailability((current) => ({
          ...current,
          status: workflowModels.length > 0 ? 'ready' : 'maintenance',
          message:
            workflowModels.length > 0
              ? null
              : '当前没有支持 12 宫格模板分镜的生图模型，请在管理端启用支持多图编辑的 OpenAI 图片模型。',
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setImageModels([]);
        setSelectedImageModel(null);
        setImageModelAvailability((current) => ({
          ...current,
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activationRequired, isLoggedIn, imageModelAvailability.reloadKey]);

  useEffect(() => {
    if (!isLoggedIn || activationRequired) {
      setVideoConfig(emptyVideoConfig);
      setVideoModels([]);
      setSelectedVideoModel(null);
      setVideoConfigLoaded(false);
      setVideoModelAvailability(createInitialModelAvailabilityState());
      return;
    }

    let cancelled = false;
    setVideoModelAvailability((current) => ({
      ...current,
      status: 'loading',
      message: null,
    }));

    void getVideoGenerationConfig()
      .then((config) => {
        if (cancelled) {
          return;
        }

        setVideoConfig(config);
        setVideoConfigLoaded(true);
        setVideoModels(config.models);
        const nextVideoModelState = resolveWorkflowVideoModelAvailability(
          config,
          selectedVideoModelRef.current,
        );
        setSelectedVideoModel(nextVideoModelState.selectedModelId);

        setVideoModelAvailability((current) => ({
          ...current,
          status: nextVideoModelState.status,
          message: nextVideoModelState.message,
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setVideoConfig(emptyVideoConfig);
        setVideoConfigLoaded(true);
        setVideoModels([]);
        setSelectedVideoModel(null);
        setVideoModelAvailability((current) => ({
          ...current,
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activationRequired, isLoggedIn, videoModelAvailability.reloadKey]);

  useEffect(() => {
    const nextSelections = resolveWorkflowVideoSelections({
      hasLoadedConfig: videoConfigLoaded,
      config: {
        enabled: videoConfig.enabled,
        durations: videoConfig.durations,
        resolutions: videoConfig.resolutions,
        defaults: {
          durationSeconds: videoConfig.defaults.durationSeconds,
          resolution: videoConfig.defaults.resolution,
        },
      },
      currentDurationSeconds: selectedDurationSeconds,
      currentResolution: selectedResolution,
    });

    if (nextSelections.selectedDurationSeconds !== selectedDurationSeconds) {
      setSelectedDurationSeconds(nextSelections.selectedDurationSeconds);
    }

    if (nextSelections.selectedResolution !== selectedResolution) {
      setSelectedResolution(nextSelections.selectedResolution);
    }
  }, [
    selectedDurationSeconds,
    selectedResolution,
    videoConfigLoaded,
    videoConfig.enabled,
    videoConfig.defaults.durationSeconds,
    videoConfig.defaults.resolution,
    videoConfig.durations,
    videoConfig.resolutions,
  ]);

  useEffect(() => {
    if (!isLoggedIn || activationRequired) {
      setWorkflowHistoryRuns([]);
      setSelectedWorkflowHistoryRunId(null);
      setWorkflowHistoryLoading(false);
      setWorkflowHistoryError(null);
      return;
    }

    let cancelled = false;

    async function loadWorkflowHistory() {
      setWorkflowHistoryLoading(true);
      setWorkflowHistoryError(null);
      try {
        const runs = await listAgentRuns({ taskType: 'video' });
        const details = await Promise.all(
          runs.map((run) =>
            getAgentRunDetail(run.id).catch(() => null),
          ),
        );
        if (cancelled) {
          return;
        }
        const workflowRunIds = new Set(
          details
            .filter((detail) =>
              detail
                ? isWorkflowVideoHistoryRun({
                    taskType: detail.run.taskType,
                    input: detail.internal?.input,
                  })
                : false,
            )
            .map((detail) => detail?.run.id)
            .filter((id): id is string => Boolean(id)),
        );
        const workflowRuns = runs.filter((run) => workflowRunIds.has(run.id));
        setWorkflowHistoryRuns(workflowRuns);
        setSelectedWorkflowHistoryRunId((current) => current ?? workflowRuns[0]?.id ?? null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setWorkflowHistoryRuns([]);
        setSelectedWorkflowHistoryRunId(null);
        setWorkflowHistoryError(error instanceof Error ? error.message : '工作流视频历史加载失败');
      } finally {
        if (!cancelled) {
          setWorkflowHistoryLoading(false);
        }
      }
    }

    void loadWorkflowHistory();

    return () => {
      cancelled = true;
    };
  }, [activationRequired, isLoggedIn]);

  const currentSnapshot = useCallback(
    () =>
      buildWorkflowStateSnapshot({
        step,
        storyboardGenerated,
        storyboardGenerating,
        selectedScene: selectedSceneBackgroundId,
        customSceneUrl: null,
        aiSceneGenerated: false,
        aiSceneGenerating: false,
        dreaming,
      }),
    [
      dreaming,
      selectedSceneBackgroundId,
      step,
      storyboardGenerated,
      storyboardGenerating,
    ],
  );

  const clearRuntimeFeedback = useCallback(() => {
    setRuntimeStatus(null);
    setRuntimeError(null);
  }, []);

  const clearWorkflowMaterialRefs = useCallback(() => {
    setSourceImageAssetId(null);
    setStoryboardRunId(null);
    setStoryboardArtifactId(null);
    setStoryboardAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
  }, []);

  const handlePatternUpload = useCallback((nextImage: string, file: File | null) => {
    sourceUploadOperationRef.current += 1;
    const operationId = sourceUploadOperationRef.current;
    setUploadedImage(nextImage || null);
    setUploadedImageOrigin(nextImage ? 'manual' : null);
    setUploadedImageFile(nextImage ? file : null);
    setPendingGeneratedImage(null);
    clearWorkflowMaterialRefs();
    const resetState = resetWorkflowForImageSourceChange(currentSnapshot());
    setStep(resetState.step);
    setStoryboardGenerated(resetState.storyboardGenerated);
    setStoryboardGenerating(resetState.storyboardGenerating);
    setStoryboardImageUrl(null);
    setSelectedSceneBackgroundId(null);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
    if (nextImage && file) {
      void uploadUserMedia({
        file,
        title: '工作流原图',
      })
        .then((asset) => {
          if (sourceUploadOperationRef.current !== operationId) {
            return;
          }
          setSourceImageAssetId(asset.id);
          setRuntimeStatus('原图已上传并暂存。');
        })
        .catch((error) => {
          if (sourceUploadOperationRef.current !== operationId) {
            return;
          }
          setRuntimeError(error instanceof Error ? error.message : '原图暂存失败，请稍后重试。');
        });
    }
  }, [clearRuntimeFeedback, clearWorkflowMaterialRefs, currentSnapshot]);

  const handleSelectImageModel = useCallback((modelId: string) => {
    if (modelId === selectedImageModel) {
      return;
    }
    setSelectedImageModel(modelId);
    setPendingGeneratedImage(null);
    clearWorkflowMaterialRefs();
    const resetState = resetWorkflowForImageSourceChange(currentSnapshot());
    setStep(resetState.step);
    setStoryboardGenerated(resetState.storyboardGenerated);
    setStoryboardGenerating(resetState.storyboardGenerating);
    setStoryboardImageUrl(null);
    setSelectedSceneBackgroundId(null);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, clearWorkflowMaterialRefs, currentSnapshot, selectedImageModel]);

  const handleSelectVideoModel = useCallback((modelId: string) => {
    setSelectedVideoModel(modelId);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleSelectDurationSeconds = useCallback((value: string) => {
    setSelectedDurationSeconds(value ? Number(value) : null);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleSelectResolution = useCallback((value: string) => {
    setSelectedResolution(value || null);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const reloadImageModels = useCallback(() => {
    setImageModelAvailability((current) => ({
      ...current,
      reloadKey: nextReloadKey(current.reloadKey),
    }));
  }, []);

  const runWorkflowAgent = useCallback(async (
    runPrompt: string,
    input: Record<string, unknown>,
    fallbackMessage: string,
  ) => {
    const { run } = await createAgentRun({
      taskType: 'workflow',
      prompt: runPrompt,
      input,
    });
    if (run.status === 'failed') {
      throw new Error(run.errorMessage ?? 'AI 工作流请求失败');
    }
    return run.finalMessage ?? fallbackMessage;
  }, []);

  const handleSubmitStoryboard = useCallback(async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (activationRequired) {
      return;
    }
    if (!uploadedImage) {
      return;
    }
    if (storyboardGenerating) {
      return;
    }
    if (!selectedImageModel) {
      setRuntimeError(imageModelUnavailableMessage ?? '当前没有可用的生图模型。');
      return;
    }

    const operationId = storyboardOperationRef.current + 1;
    storyboardOperationRef.current = operationId;
    setStep(1);
    setStoryboardGenerating(true);
    setStoryboardGenerated(false);
    setStoryboardImageUrl(null);
    setStoryboardRunId(null);
    setStoryboardArtifactId(null);
    setStoryboardAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setRuntimeStatus(null);
    setRuntimeError(null);

    try {
      const { run } = await createAgentRun({
        taskType: 'workflow',
        prompt,
        input: {
          stage: 'storyboard',
          selectedImageModelId: selectedImageModel,
          sourceImageOrigin: uploadedImageOrigin ?? 'manual',
          sourceImageDataUrl: uploadedImage,
        },
      });

      if (run.status === 'failed') {
        throw new Error(run.errorMessage ?? '分镜生成失败');
      }

      const detail = await waitForTerminalRun({
        runId: run.id,
        operationRef: storyboardOperationRef,
        operationId,
        getDetail: getAgentRunDetail,
      });
      if (!detail) {
        return;
      }
      if (detail.run.status === 'failed') {
        throw new Error(detail.run.errorMessage ?? '分镜生成失败');
      }

      const artifact = detail.run.artifacts.find(
        (item) => item.kind === 'image' && item.status === 'ready',
      );
      if (!artifact) {
        throw new Error('分镜生成完成，但没有找到可预览的结果。');
      }

      const access = await getGeneratedRunArtifactAccess(detail.run.id, artifact.id, 'preview');
      if (storyboardOperationRef.current !== operationId) {
        return;
      }

      setStoryboardImageUrl(access.url);
      setStoryboardRunId(detail.run.id);
      setStoryboardArtifactId(artifact.id);
      setStoryboardAssetId(null);
      setRuntimeStatus('12宫格分镜图已生成。');
      setStoryboardGenerating(false);
      setStoryboardGenerated(true);
    } catch (error) {
      if (storyboardOperationRef.current !== operationId) {
        return;
      }
      setStoryboardGenerating(false);
      setStoryboardGenerated(false);
      setStoryboardImageUrl(null);
      setStoryboardRunId(null);
      setStoryboardArtifactId(null);
      setStoryboardAssetId(null);
      setRuntimeError(error instanceof Error ? error.message : '分镜生成请求失败');
    }
  }, [
    activationRequired,
    imageModelUnavailableMessage,
    isLoggedIn,
    openLoginModal,
    prompt,
    selectedImageModel,
    storyboardGenerating,
    uploadedImage,
    uploadedImageOrigin,
  ]);

  const handleCancelStoryboard = useCallback(() => {
    storyboardOperationRef.current += 1;
    setStoryboardGenerating(false);
    setStoryboardGenerated(false);
    setStoryboardImageUrl(null);
    setStoryboardRunId(null);
    setStoryboardArtifactId(null);
    setStoryboardAssetId(null);
    clearRuntimeFeedback();
    setStep(0);
  }, [clearRuntimeFeedback]);

  const handleRegenerateStoryboard = useCallback(async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (activationRequired) {
      return;
    }
    if (storyboardGenerating) {
      return;
    }
    if (!selectedImageModel) {
      setRuntimeError(imageModelUnavailableMessage ?? '当前没有可用的生图模型。');
      return;
    }

    const operationId = storyboardOperationRef.current + 1;
    storyboardOperationRef.current = operationId;
    setStoryboardGenerating(true);
    setStoryboardGenerated(false);
    setStoryboardImageUrl(null);
    setStoryboardRunId(null);
    setStoryboardArtifactId(null);
    setStoryboardAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setRuntimeStatus(null);
    setRuntimeError(null);

    try {
      const { run } = await createAgentRun({
        taskType: 'workflow',
        prompt,
        input: {
          stage: 'storyboard-regenerate',
          selectedImageModelId: selectedImageModel,
          sourceImageOrigin: uploadedImageOrigin ?? 'manual',
          sourceImageDataUrl: uploadedImage,
        },
      });

      if (run.status === 'failed') {
        throw new Error(run.errorMessage ?? '分镜重新生成失败');
      }

      const detail = await waitForTerminalRun({
        runId: run.id,
        operationRef: storyboardOperationRef,
        operationId,
        getDetail: getAgentRunDetail,
      });
      if (!detail) {
        return;
      }
      if (detail.run.status === 'failed') {
        throw new Error(detail.run.errorMessage ?? '分镜重新生成失败');
      }

      const artifact = detail.run.artifacts.find(
        (item) => item.kind === 'image' && item.status === 'ready',
      );
      if (!artifact) {
        throw new Error('分镜重新生成完成，但没有找到可预览的结果。');
      }

      const access = await getGeneratedRunArtifactAccess(detail.run.id, artifact.id, 'preview');
      if (storyboardOperationRef.current !== operationId) {
        return;
      }

      setStoryboardImageUrl(access.url);
      setStoryboardRunId(detail.run.id);
      setStoryboardArtifactId(artifact.id);
      setStoryboardAssetId(null);
      setRuntimeStatus('12宫格分镜图已重新生成。');
      setStoryboardGenerating(false);
      setStoryboardGenerated(true);
    } catch (error) {
      if (storyboardOperationRef.current !== operationId) {
        return;
      }
      setStoryboardGenerating(false);
      setStoryboardGenerated(false);
      setStoryboardImageUrl(null);
      setStoryboardRunId(null);
      setStoryboardArtifactId(null);
      setStoryboardAssetId(null);
      setRuntimeError(error instanceof Error ? error.message : '分镜重新生成请求失败');
    }
  }, [
    activationRequired,
    imageModelUnavailableMessage,
    isLoggedIn,
    openLoginModal,
    prompt,
    selectedImageModel,
    storyboardGenerating,
    uploadedImage,
    uploadedImageOrigin,
  ]);

  const handleNextFromStoryboard = useCallback(() => {
    setStep(2);
  }, []);

  const handleUploadStepNext = useCallback(() => {
    const action = resolveWorkflowUploadStepNextAction({
      storyboardAssetId,
      storyboardRunId,
      storyboardArtifactId,
    });

    if (action === 'view_storyboard') {
      setStep(1);
      clearRuntimeFeedback();
      return;
    }

    void handleSubmitStoryboard();
  }, [
    clearRuntimeFeedback,
    handleSubmitStoryboard,
    storyboardArtifactId,
    storyboardAssetId,
    storyboardRunId,
  ]);

  const handleGoToPreviousStep = useCallback(() => {
    setStep((current) => Math.max(current - 1, 0));
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleViewHistoryVideo = useCallback(() => {
    setStep(3);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleProceedToDreamStep = useCallback(() => {
    clearRuntimeFeedback();
    setStep(3);
  }, [clearRuntimeFeedback]);

  const handleSelectWorkflowSceneBackground = useCallback((id: string) => {
    const resetState = resetWorkflowForSceneChange(currentSnapshot());
    setStep(resetState.step);
    setDreaming(resetState.dreaming);
    setSelectedSceneBackgroundId(id);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

  const loadWorkflowVideoRunPreview = useCallback(async (runId: string) => {
    setSelectedWorkflowHistoryRunId(runId);
    setRuntimeError(null);
    setRuntimeStatus('正在加载工作流视频记录...');

    try {
      const syncedRun = await syncAgentRun(runId).catch(() => null);
      const detail = await getAgentRunDetail(runId);
      const restore = createWorkflowVideoRestoreSnapshot(detail);
      if (!restore) {
        throw new Error('该记录不是工作流视频任务。');
      }

      setWorkflowHistoryRuns((current) => [
        syncedRun ?? detail.run,
        ...current.filter((run) => run.id !== runId),
      ]);
      setStep(restore.step);
      setSourceImageAssetId(restore.sourceImageAssetId);
      setUploadedImageOrigin(restore.uploadedImageOrigin);
      setUploadedImageFile(null);
      setStoryboardRunId(restore.storyboardRunId);
      setStoryboardArtifactId(restore.storyboardArtifactId);
      setStoryboardAssetId(restore.storyboardAssetId);
      setSelectedSceneBackgroundId(restore.selectedSceneBackgroundId);
      setSelectedVideoModel(restore.selectedVideoModel);
      setPrompt(restore.prompt || DEFAULT_PROMPT);
      setDreamRunId(restore.dreamRunId);
      setDreamVideoArtifactId(restore.dreamVideoArtifactId);
      setDreaming(shouldContinueWorkflowVideoSync(detail.run.status));

      if (restore.sourceImageAssetId) {
        void getSavedMediaAssetAccess(restore.sourceImageAssetId, 'preview')
          .then((access) => setUploadedImage(access.url))
          .catch(() => null);
      }

      if (restore.storyboardRunId && restore.storyboardArtifactId) {
        void getGeneratedRunArtifactAccess(restore.storyboardRunId, restore.storyboardArtifactId, 'preview')
          .then((access) => {
            setStoryboardImageUrl(access.url);
            setStoryboardGenerated(true);
          })
          .catch(() => null);
      }

      const videoArtifact = firstMediaArtifact(detail.run, 'video');
      if (detail.run.status === 'failed') {
        setDreamVideoUrl(null);
        setRuntimeStatus(null);
        setRuntimeError(detail.run.errorMessage ?? '工作流视频生成失败');
        setDreaming(false);
        return;
      }
      if (!videoArtifact) {
        setDreamVideoUrl(null);
        setRuntimeStatus('工作流视频任务仍在处理中。');
        return;
      }

      const videoAccess = await getGeneratedRunArtifactAccess(detail.run.id, videoArtifact.id, 'preview');
      setDreamVideoUrl(videoAccess.url);
      setRuntimeStatus('已加载工作流视频记录。');
      setDreaming(false);
    } catch (error) {
      setRuntimeStatus(null);
      setRuntimeError(error instanceof Error ? error.message : '工作流视频记录加载失败');
    }
  }, []);

  const handleStartDream = useCallback(async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (activationRequired) return;
    if (dreaming) return;
    if (videoModelAvailability.status === 'loading') {
      setRuntimeError('视频模型加载中，请稍后再试。');
      return;
    }
    if (!videoConfig.enabled || videoModelAvailability.status === 'maintenance' || !selectedVideoModel) {
      setRuntimeError(videoModelUnavailableMessage ?? '当前没有可用的视频模型。');
      return;
    }
    const materialReadiness = resolveWorkflowVideoMaterialReadiness({
      hasSourceImageAsset: Boolean(sourceImageAssetId),
      hasSourceImageFile: Boolean(uploadedImageFile),
      hasStoryboardAsset: Boolean(storyboardAssetId),
      hasStoryboardRunArtifact: Boolean(storyboardRunId && storyboardArtifactId),
      hasSelectedConfiguredBackground: Boolean(selectedWorkflowSceneBackground),
    });
    if (!materialReadiness.ready) {
      setRuntimeError(materialReadiness.message ?? '请补齐工作流视频材料。');
      return;
    }
    const resolvedDurationSeconds = selectedDurationSeconds ?? videoConfig.defaults.durationSeconds;
    const resolvedResolution = selectedResolution ?? videoConfig.defaults.resolution;
    if (resolvedDurationSeconds === null || !resolvedResolution) {
      setRuntimeError('视频参数未准备完成，请确认时长和分辨率后重试。');
      return;
    }
    setStep(3);
    setDreaming(true);
    setRuntimeStatus(null);
    setRuntimeError(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    const operationId = dreamOperationRef.current + 1;
    dreamOperationRef.current = operationId;
    try {
      setRuntimeStatus('正在上传原图并保存分镜图...');
      const sourceAssetId =
        sourceImageAssetId ??
        (await uploadUserMedia({
          file: uploadedImageFile as File,
          title: '工作流原图',
        })).id;
      if (dreamOperationRef.current !== operationId) return;
      setSourceImageAssetId(sourceAssetId);

      const storyboardSavedAssetId =
        storyboardAssetId ??
        (await saveGeneratedMedia({
          runId: storyboardRunId as string,
          artifactId: storyboardArtifactId as string,
        })).asset.id;
      if (dreamOperationRef.current !== operationId) return;
      setStoryboardAssetId(storyboardSavedAssetId);

      setRuntimeStatus('视频任务已提交，正在等待模型处理...');
      const { run } = await createAgentRun({
        taskType: 'workflow',
        prompt,
        input: {
          stage: 'workflow_video',
          modelId: selectedVideoModel,
          sourceImageAssetId: sourceAssetId,
          storyboardArtifactId: storyboardSavedAssetId,
          sceneBackgroundId: selectedWorkflowSceneBackground?.id,
          origin: window.location.origin,
          storyboardPromptMap: {
            storyboardRunId,
            storyboardArtifactId,
            workflowPrompt: prompt,
            sourceImageOrigin: uploadedImageOrigin ?? 'manual',
            sceneBackgroundId: selectedWorkflowSceneBackground?.id,
            sceneBackgroundName: selectedWorkflowSceneBackground?.name,
          },
          durationSeconds: resolvedDurationSeconds,
          resolution: resolvedResolution,
          styleCode: videoConfig.defaults.styleCode ?? undefined,
        },
      });
      if (run.status === 'failed') {
        throw new Error(run.errorMessage ?? '造梦请求失败');
      }
      if (dreamOperationRef.current !== operationId) return;

      setDreamRunId(run.id);
      setSelectedWorkflowHistoryRunId(run.id);
      setWorkflowHistoryRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setRuntimeStatus(`视频任务已提交，任务 ID：${run.id}。正在等待模型处理...`);
      void (async () => {
        const latestRun = await syncWorkflowVideoRunUntilTerminal({
          runId: run.id,
          maxAttempts: WORKFLOW_VIDEO_SYNC_MAX_ATTEMPTS,
          intervalMs: WORKFLOW_VIDEO_SYNC_INTERVAL_MS,
          syncRun: syncAgentRun,
          wait,
          onRun: (syncedRun) => {
            setWorkflowHistoryRuns((current) => [
              syncedRun,
              ...current.filter((item) => item.id !== syncedRun.id),
            ]);
          },
        });
        if (dreamOperationRef.current !== operationId) {
          return;
        }

        if (latestRun.status === 'succeeded') {
          const detail = await getAgentRunDetail(run.id);
          const videoArtifact = firstMediaArtifact(detail.run, 'video');
          if (!videoArtifact) {
            throw new Error('工作流视频已完成，但没有找到可预览的视频。');
          }

          const videoAccess = await getGeneratedRunArtifactAccess(detail.run.id, videoArtifact.id, 'preview');
          if (dreamOperationRef.current !== operationId) {
            return;
          }

          setWorkflowHistoryRuns((current) => [
            detail.run,
            ...current.filter((item) => item.id !== detail.run.id),
          ]);
          setDreamVideoArtifactId(videoArtifact.id);
          setDreamVideoUrl(videoAccess.url);
          setRuntimeStatus('工作流视频已生成。');
          setDreaming(false);
          return;
        }

        if (latestRun.status === 'failed') {
          throw new Error(latestRun.errorMessage ?? '工作流视频生成失败');
        }

        setRuntimeStatus('工作流视频任务仍在处理中，请稍后从历史记录查看。');
        setDreaming(false);
      })().catch((error) => {
        if (dreamOperationRef.current !== operationId) {
          return;
        }
        setDreaming(false);
        setRuntimeStatus(null);
        setRuntimeError(error instanceof Error ? error.message : '工作流视频同步失败');
      });
    } catch (error) {
      if (dreamOperationRef.current !== operationId) return;
      setDreaming(false);
      setRuntimeError(error instanceof Error ? error.message : '造梦请求失败');
    }
  }, [
    activationRequired,
    dreaming,
    isLoggedIn,
    openLoginModal,
    prompt,
    selectedVideoModel,
    selectedWorkflowSceneBackground,
    sourceImageAssetId,
    storyboardArtifactId,
    storyboardAssetId,
    storyboardRunId,
    selectedDurationSeconds,
    selectedResolution,
    uploadedImageFile,
    uploadedImageOrigin,
    videoConfig.enabled,
    videoConfig.defaults.durationSeconds,
    videoConfig.defaults.resolution,
    videoConfig.defaults.styleCode,
    videoModelAvailability.status,
    videoModelUnavailableMessage,
  ]);

  const handleApplyOptimizedPrompt = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleApplyGeneratedImage = useCallback((imageUrl: string) => {
    const nextState = applyGeneratedWorkflowImage(currentSnapshot(), imageUrl, uploadedImageOrigin === 'manual');
    if (uploadedImage && uploadedImageOrigin === 'manual') {
      setPendingGeneratedImage(nextState.imageUrl);
      return;
    }

    setUploadedImage(nextState.imageUrl);
    setUploadedImageOrigin('generated');
    setUploadedImageFile(null);
    setPendingGeneratedImage(null);
    clearWorkflowMaterialRefs();
    setStep(nextState.resetState.step);
    setStoryboardGenerated(nextState.resetState.storyboardGenerated);
    setStoryboardGenerating(nextState.resetState.storyboardGenerating);
    setStoryboardImageUrl(null);
    setSelectedSceneBackgroundId(null);
    setDreaming(nextState.resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, clearWorkflowMaterialRefs, currentSnapshot, uploadedImage, uploadedImageOrigin]);

  const handleConfirmPendingGeneratedImage = useCallback(() => {
    if (!pendingGeneratedImage) {
      return;
    }

    setUploadedImage(pendingGeneratedImage);
    setUploadedImageOrigin('generated');
    setUploadedImageFile(null);
    setPendingGeneratedImage(null);
    clearWorkflowMaterialRefs();
    const resetState = resetWorkflowForImageSourceChange(currentSnapshot());
    setStep(resetState.step);
    setStoryboardGenerated(resetState.storyboardGenerated);
    setStoryboardGenerating(resetState.storyboardGenerating);
    setStoryboardImageUrl(null);
    setSelectedSceneBackgroundId(null);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, clearWorkflowMaterialRefs, currentSnapshot, pendingGeneratedImage]);

  const handleRejectPendingGeneratedImage = useCallback(() => {
    setPendingGeneratedImage(null);
  }, []);

  const steps = [
    { label: '上传图案', icon: Upload },
    { label: '12宫格分镜', icon: Film },
    { label: '选择场景', icon: Mountain },
    { label: '开始造梦', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PromptOptimizationDialog
        open={promptDialogOpen}
        onOpenChange={setPromptDialogOpen}
        currentPrompt={prompt}
        isLoggedIn={isLoggedIn}
        activationRequired={activationRequired}
        openLoginModal={openLoginModal}
        onApply={handleApplyOptimizedPrompt}
      />
      <ImageGenerationDialog
        open={imageGenerationDialogOpen}
        onOpenChange={setImageGenerationDialogOpen}
        prompt={prompt}
        selectedImageModelId={selectedImageModel}
        isLoggedIn={isLoggedIn}
        activationRequired={activationRequired}
        openLoginModal={openLoginModal}
        onApply={handleApplyGeneratedImage}
      />
      <WorkflowNav />

      <div className="mx-auto max-w-7xl px-4 pt-20 pb-12 sm:px-6">
        {activationRequired && (
          <ProtectedAccountPanel accountState={user?.accountState} title="激活账号后使用 AI 工作流" />
        )}
        {(runtimeError || runtimeStatus) && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            runtimeError
              ? 'border-red-500/20 bg-red-500/5 text-red-500'
              : 'border-border bg-secondary text-muted-foreground'
          }`}
          >
            {runtimeError ?? runtimeStatus}
          </div>
        )}
        {/* 步骤条 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                  step === i ? 'border-primary bg-primary text-primary-foreground' :
                  step > i ? 'border-border bg-secondary text-foreground' :
                  'border-border bg-card text-muted-foreground'
                }`}>
                  <s.icon size={14} />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-2 h-px w-8 sm:w-16 ${step > i ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 主内容区 */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* 左侧面板 */}
          <div className="lg:col-span-3 space-y-6">
            {/* Step 0: 上传图案 + 模型选择 */}
            {step === 0 && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6">
                  <h2 className="mb-4 text-lg font-semibold text-foreground">上传图案</h2>
                  <PatternUploadZone uploadedImage={uploadedImage} onUpload={handlePatternUpload} />
                </div>
                <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">12宫格提示词</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        这段提示词会随上传图案一起传递给 12 宫格分镜。
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPrompt(DEFAULT_PROMPT);
                          clearRuntimeFeedback();
                        }}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                      >
                        <RotateCcw size={12} />
                        恢复默认
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromptDialogOpen(true)}
                        className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85"
                      >
                        <Wand2 size={12} />
                        AI优化
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      clearRuntimeFeedback();
                    }}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-input bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                  />
                </div>
                <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6">
                  {imageModelAvailability.status === 'ready' && decoratedImageModels.length > 0 ? (
                    <ModelSelector
                      models={decoratedImageModels}
                      selectedModel={selectedImageModel}
                      onSelect={handleSelectImageModel}
                      title="选择生图模型"
                      icon={Zap}
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Zap size={14} className="text-muted-foreground" />
                        选择生图模型
                      </div>
                      <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
                        <p>{imageModelLoading ? '生图模型加载中...' : imageModelUnavailableMessage ?? '当前没有可用的生图模型。'}</p>
                        {isLoggedIn && imageModelAvailability.status === 'maintenance' ? (
                          <button
                            type="button"
                            onClick={reloadImageModels}
                            className="mt-3 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
                          >
                            重新加载模型
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleUploadStepNext}
                  disabled={!uploadedImage || imageModelLoading || !selectedImageModel || Boolean(imageModelUnavailableMessage)}
                  className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium transition-all ${
                    uploadedImage && !activationRequired && !imageModelLoading && selectedImageModel && !imageModelUnavailableMessage
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'cursor-not-allowed bg-secondary text-muted-foreground'
                  }`}
                >
                  {activationRequired
                    ? '请先激活账号'
                    : resolveWorkflowUploadStepNextAction({
                        storyboardAssetId,
                        storyboardRunId,
                        storyboardArtifactId,
                      }) === 'view_storyboard'
                      ? '下一步：查看12宫格'
                      : '下一步：生成分镜'}
                  {!activationRequired ? <ChevronRight size={14} /> : null}
                </button>
              </div>
            )}

            {/* Step 1: 12宫格分镜图 */}
            {step === 1 && (
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground">12宫格分镜图</h2>
                  <button
                    type="button"
                    onClick={handleGoToPreviousStep}
                    disabled={storyboardGenerating}
                    className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    上一步
                  </button>
                </div>
                <StoryboardSingleImage
                  generating={storyboardGenerating}
                  generated={storyboardGenerated}
                  imageUrl={storyboardImageUrl}
                  modelName={currentImageModel?.name || ''}
                  onCancel={handleCancelStoryboard}
                  onRegenerate={handleRegenerateStoryboard}
                  onNext={handleNextFromStoryboard}
                />
                {pendingGeneratedImage ? (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-foreground">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">检测到新的生成结果</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          当前已经有手动上传图案。请先确认是否切换到新结果，再继续后续步骤。
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRejectPendingGeneratedImage}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                        >
                          保留当前图
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmPendingGeneratedImage}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85"
                        >
                          切换为新图
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Step 2: 选择场景 */}
            {step === 2 && (
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground">选择场景</h2>
                  <button
                    type="button"
                    onClick={handleGoToPreviousStep}
                    className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                  >
                    上一步
                  </button>
                </div>
                <SceneSelector
                  backgrounds={workflowSceneBackgrounds}
                  selectedBackgroundId={selectedSceneBackgroundId}
                  loading={videoModelLoading}
                  unavailableMessage={videoModelPlaceholderMessage}
                  dreamAction={resolveWorkflowSceneStepDreamAction({
                    dreamRunId,
                    hasDreamVideo: Boolean(dreamVideoUrl),
                  })}
                  onSelectBackground={handleSelectWorkflowSceneBackground}
                  onProceedToDreamStep={handleProceedToDreamStep}
                  onViewHistoryVideo={handleViewHistoryVideo}
                />
              </div>
            )}

            {/* Step 3: 开始造梦 */}
            {step === 3 && (
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground">开始造梦</h2>
                  <button
                    type="button"
                    onClick={handleGoToPreviousStep}
                    className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                  >
                    上一步
                  </button>
                </div>
                {dreaming ? (
                  <DreamGeneration videoModel={currentVideoModel?.name || ''} />
                ) : dreamVideoUrl ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-xl border border-border bg-black">
                      <video src={dreamVideoUrl} controls className="aspect-video w-full bg-black" />
                    </div>
                    <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                      工作流视频已生成{dreamVideoArtifactId ? `，结果 ID：${dreamVideoArtifactId}` : ''}。
                    </div>
                  </div>
                ) : !dreamRunId ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-secondary/40 px-4 py-4 text-sm text-muted-foreground">
                      已确认场景与视频参数。点击下方按钮后才会正式提交视频生成任务。
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleStartDream()}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/85"
                    >
                      开始造梦并提交视频任务
                      <Sparkles size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-secondary/40 px-4 py-6 text-sm text-muted-foreground">
                    {dreamRunId
                      ? `造梦任务已提交，任务 ID：${dreamRunId}。你可以返回上一步调整材料并生成新的视频。`
                      : '造梦任务已结束。你可以返回上一步继续调整场景、提示词或视频模型后重新开始。'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">造梦记录</p>
                <span className="text-[11px] text-muted-foreground">
                  {workflowHistoryRuns.length > 0 ? `${workflowHistoryRuns.length} 条` : ''}
                </span>
              </div>
              {workflowHistoryError ? (
                <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                  {workflowHistoryError}
                </div>
              ) : null}
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {workflowHistoryLoading ? (
                  <div className="rounded-xl border border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
                    正在加载记录...
                  </div>
                ) : workflowHistoryRuns.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
                    暂无造梦记录
                  </div>
                ) : (
                  workflowHistoryRuns.map((run) => {
                    const artifact = firstMediaArtifact(run, 'video');
                    const isSelected = selectedWorkflowHistoryRunId === run.id;
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => void loadWorkflowVideoRunPreview(run.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'border-ring bg-secondary text-foreground'
                            : 'border-border bg-background hover:border-ring'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium">
                            {run.prompt}
                          </span>
                          <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                            {run.status === 'succeeded'
                              ? '完成'
                              : run.status === 'failed'
                                ? '失败'
                                : '运行中'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{formatHistoryTime(run.createdAt)}</span>
                          <span>{artifact ? '可预览' : '等待结果'}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* 当前图片模型 */}
            {(step === 0 || step === 1) && (
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
                <p className="mb-2 text-xs text-muted-foreground">当前生图模型</p>
                {currentImageModel ? (
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${currentImageModel.logoBg}`}>
                      {currentImageModel.logo}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{currentImageModel.name}</p>
                      <p className="text-xs text-muted-foreground">{currentImageModel.desc}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    {imageModelLoading ? '生图模型加载中...' : imageModelUnavailableMessage ?? '当前没有可用的生图模型。'}
                  </div>
                )}
              </div>
            )}

            {/* 提示词 + 视频模型（Step 2+） */}
            {(step === 2 || step === 3) && (
              <>
                <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">提示词</p>
                    <button
                      onClick={() => {
                        setPrompt(DEFAULT_PROMPT);
                        clearRuntimeFeedback();
                      }}
                      className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw size={10} />
                      恢复默认
                    </button>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      clearRuntimeFeedback();
                    }}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-input bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                  />
                </div>
                <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">视频参数</p>
                    <span className="text-[11px] text-muted-foreground">按会员配置展示</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-xs text-muted-foreground">时长</span>
                      <select
                        value={selectedDurationSeconds?.toString() ?? ''}
                        onChange={(e) => handleSelectDurationSeconds(e.target.value)}
                        disabled={videoConfig.durations.length <= 1}
                        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {videoConfig.durations.map((duration) => (
                          <option key={duration} value={duration.toString()}>
                            {duration} 秒
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs text-muted-foreground">分辨率</span>
                      <select
                        value={selectedResolution ?? ''}
                        onChange={(e) => handleSelectResolution(e.target.value)}
                        disabled={videoConfig.resolutions.length <= 1}
                        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {videoConfig.resolutions.map((resolution) => (
                          <option key={resolution.value} value={resolution.value}>
                            {resolution.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {!videoConfig.enabled ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      当前账号暂未启用视频生成参数配置。
                    </p>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
                  {videoModelAvailability.status === 'ready' ? (
                    <ModelSelector
                      models={decoratedVideoModels}
                      selectedModel={selectedVideoModel}
                      onSelect={handleSelectVideoModel}
                      title="视频生成模型"
                      icon={Film}
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Film size={14} className="text-muted-foreground" />
                        视频生成模型
                      </div>
                      <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
                        <p>{videoModelLoading ? '视频模型加载中...' : videoModelPlaceholderMessage}</p>
                        {videoModelAvailability.status === 'maintenance' ? (
                          <button
                            type="button"
                            onClick={() =>
                              setVideoModelAvailability((current) => ({
                                ...current,
                                reloadKey: nextReloadKey(current.reloadKey),
                              }))
                            }
                            className="mt-3 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
                          >
                            重新加载模型
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 预览区 */}
            {(step === 0 && uploadedImage) && (
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
                <p className="mb-2 text-xs text-muted-foreground">图案预览</p>
                <div className="overflow-hidden rounded-xl border border-border">
                  <img src={uploadedImage} alt="预览" className="mx-auto max-h-48 object-contain" />
                </div>
              </div>
            )}

            {/* 快捷操作 */}
            <div className="rounded-2xl border border-border bg-secondary/50 backdrop-blur-md p-5">
              <p className="mb-3 text-sm font-medium text-foreground">快捷操作</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setImageGenerationDialogOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-left text-xs text-muted-foreground transition-all hover:border-ring hover:text-foreground"
                >
                  <Sparkles size={12} /> AI生图
                </button>
                <button
                  type="button"
                  onClick={() => setPromptDialogOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-left text-xs text-muted-foreground transition-all hover:border-ring hover:text-foreground"
                >
                  <Wand2 size={12} /> AI对话优化提示词
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
