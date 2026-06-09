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
  listImageModels,
  saveGeneratedMedia,
  syncAgentRun,
  getVideoGenerationConfig,
  selectImageModelId,
  uploadUserMedia,
  type VideoGenerationConfigDto,
  type ImageModelMode,
  type ImageModelOption,
  type VideoModelOption,
} from '@/features/public/agent-runtime-client';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
} from '@/features/public/model-availability';
import {
  applyGeneratedReferenceScene,
  applyGeneratedWorkflowImage,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
  resolveWorkflowVideoMaterialReadiness,
  resolveWorkflowVideoModelAvailability,
  type WorkflowStateSnapshot,
} from './workflow-state';
import { createReferenceImageDialogState } from './workflow-quick-actions';
import {
  ImageGenerationDialog,
  PromptOptimizationDialog,
  ReferenceImageDialog,
  waitForTerminalRun,
} from './workflow-quick-action-dialogs';
import {
  ArrowLeft,
  Upload,
  Wand2,
  ChevronRight,
  Check,
  Film,
  RotateCcw,
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
} from 'lucide-react';

// 默认提示词
const DEFAULT_PROMPT = '石头印画风格，将图案转化为石纹肌理效果，保留原始构图，增添天然石纹质感和裂缝光影细节，色调温暖沉稳，边缘自然风化，背景深色石板';

// 预设场景
const PRESET_SCENES = [
  { id: 'workshop', name: '石印工坊', desc: '暗色工坊内，石板台上微光', icon: '🔨' },
  { id: 'mountain', name: '山间溪流', desc: '溪水冲刷石面，自然光影', icon: '🏔️' },
  { id: 'temple', name: '古寺石壁', desc: '千年古寺石壁上的印记', icon: '⛩️' },
  { id: 'garden', name: '枯山水庭', desc: '日式庭园中的砂石纹理', icon: '🪨' },
  { id: 'cave', name: '溶洞奇观', desc: '钟乳石洞中的光影变幻', icon: '🕳️' },
  { id: 'night', name: '月光石径', desc: '月光下石板路的静谧', icon: '🌙' },
];

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
};

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
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-secondary">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.nickname} className="h-full w-full object-cover" />
                ) : (
                  <User size={14} className="text-foreground" />
                )}
              </div>
              <span className="text-xs text-foreground">{user.nickname}</span>
            </div>
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
function SceneSelector({ selectedScene, customSceneUrl, aiSceneGenerating, aiSceneGenerated, onSelectPreset, onCustomUpload, onAIGenerate, onAiSceneCancel, onAiSceneRegenerate, onStartDream }: {
  selectedScene: string | null;
  customSceneUrl: string | null;
  aiSceneGenerating: boolean;
  aiSceneGenerated: boolean;
  onSelectPreset: (id: string) => void;
  onCustomUpload: (url: string, file: File) => void;
  onAIGenerate: () => void;
  onAiSceneCancel: () => void;
  onAiSceneRegenerate: () => void;
  onStartDream: () => void;
}) {
  const [sceneMode, setSceneMode] = useState<'preset' | 'custom' | 'ai'>('preset');
  const [aiProgress, setAiProgress] = useState(0);

  useEffect(() => {
    if (aiSceneGenerating) {
      setAiProgress(0);
      const interval = setInterval(() => {
        setAiProgress((prev) => { if (prev >= 100) { clearInterval(interval); return 100; } return prev + 2; });
      }, 80);
      return () => clearInterval(interval);
    }
  }, [aiSceneGenerating]);

  const handleCustomFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const result = ev.target?.result; if (typeof result === 'string') onCustomUpload(result, file); };
    reader.readAsDataURL(file);
  }, [onCustomUpload]);

  const isSceneReady = selectedScene !== null || customSceneUrl !== null || aiSceneGenerated;

  return (
    <div className="space-y-4">
      {/* 场景模式切换 */}
      <div className="flex gap-2">
        {[
          { key: 'preset' as const, label: '预设场景', icon: Mountain },
          { key: 'custom' as const, label: '自定义场景', icon: Upload },
          { key: 'ai' as const, label: 'AI生成场景', icon: Sparkles },
        ].map((mode) => (
          <button
            key={mode.key}
            onClick={() => setSceneMode(mode.key)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all ${
              sceneMode === mode.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-ring'
            }`}
          >
            <mode.icon size={12} />
            {mode.label}
          </button>
        ))}
      </div>

      {/* 预设场景 */}
      {sceneMode === 'preset' && (
        <div className="grid grid-cols-3 gap-2">
          {PRESET_SCENES.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onSelectPreset(scene.id)}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                selectedScene === scene.id
                  ? 'border-border bg-secondary shadow-sm'
                  : 'border-border bg-card hover:border-ring'
              }`}
            >
              <span className="text-xl">{scene.icon}</span>
              <span className="text-xs font-medium text-foreground">{scene.name}</span>
              <span className="text-[10px] text-muted-foreground">{scene.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* 自定义上传 */}
      {sceneMode === 'custom' && (
        <div className="space-y-3">
          {customSceneUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-2">
              <img src={customSceneUrl} alt="自定义场景" className="mx-auto max-h-56 object-contain" />
              <div className="absolute top-2 right-2">
                <span className="flex items-center gap-1 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground">
                  <Check size={10} />
                  已选择
                </span>
              </div>
            </div>
          ) : (
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card p-8 transition-all hover:border-ring"
              onClick={() => document.getElementById('scene-custom-upload')?.click()}
            >
              <input id="scene-custom-upload" type="file" accept="image/*" className="hidden" onChange={handleCustomFile} />
              <Upload size={24} className="mb-2 text-muted-foreground" />
              <p className="text-sm text-foreground">上传自定义场景图</p>
              <p className="mt-1 text-xs text-muted-foreground">JPG、PNG 格式</p>
            </div>
          )}
        </div>
      )}

      {/* AI生成场景 */}
      {sceneMode === 'ai' && (
        <div className="space-y-3">
          {aiSceneGenerating ? (
            <div className="space-y-3">
              <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-border bg-secondary/80 backdrop-blur-md">
                <Loader2 size={32} className="mb-3 animate-spin text-foreground" />
                <p className="text-sm font-medium text-foreground">AI正在生成场景...</p>
                <p className="mt-1 text-xs text-muted-foreground">{aiProgress}%</p>
                <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${aiProgress}%` }} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onAiSceneCancel} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2 text-xs text-muted-foreground hover:border-ring">
                  <XCircle size={12} /> 取消
                </button>
                <button onClick={onAiSceneRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2 text-xs text-muted-foreground hover:border-ring">
                  <RefreshCw size={12} /> 重新生成
                </button>
              </div>
            </div>
          ) : aiSceneGenerated ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-border bg-secondary p-2 shadow-sm">
                <div className="flex aspect-[16/10] items-center justify-center">
                  <div className="text-center">
                    <Mountain size={32} className="mx-auto mb-2 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">AI生成的场景图</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onAiSceneRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2 text-xs text-muted-foreground hover:border-ring">
                  <RefreshCw size={12} /> 重新生成
                </button>
              </div>
            </div>
          ) : (
            <button onClick={onAIGenerate} className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card p-8 transition-all hover:border-ring hover:bg-secondary/60">
              <Sparkles size={28} className="text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">点击生成AI场景</p>
              <p className="text-xs text-muted-foreground">根据上传的图案自动生成匹配的场景</p>
            </button>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {isSceneReady && (
        <div className="flex gap-3 pt-2">
          <button onClick={onAiSceneCancel} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm text-muted-foreground transition-all hover:border-ring hover:text-foreground">
            取消
          </button>
          <button onClick={onAiSceneRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm text-muted-foreground transition-all hover:border-ring hover:text-foreground">
            <RefreshCw size={14} />
            重新生成
          </button>
          <button onClick={onStartDream} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/85">
            开始造梦
            <Sparkles size={14} />
          </button>
        </div>
      )}
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
  const [videoModelAvailability, setVideoModelAvailability] = useState(createInitialModelAvailabilityState());
  const [storyboardGenerating, setStoryboardGenerating] = useState(false);
  const [storyboardGenerated, setStoryboardGenerated] = useState(false);
  const [storyboardImageUrl, setStoryboardImageUrl] = useState<string | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [sourceImageAssetId, setSourceImageAssetId] = useState<string | null>(null);
  const [storyboardRunId, setStoryboardRunId] = useState<string | null>(null);
  const [storyboardArtifactId, setStoryboardArtifactId] = useState<string | null>(null);
  const [storyboardAssetId, setStoryboardAssetId] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [customSceneUrl, setCustomSceneUrl] = useState<string | null>(null);
  const [customSceneFile, setCustomSceneFile] = useState<File | null>(null);
  const [sceneBackgroundAssetId, setSceneBackgroundAssetId] = useState<string | null>(null);
  const [aiSceneGenerating, setAiSceneGenerating] = useState(false);
  const [aiSceneGenerated, setAiSceneGenerated] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [dreaming, setDreaming] = useState(false);
  const [dreamRunId, setDreamRunId] = useState<string | null>(null);
  const [dreamVideoUrl, setDreamVideoUrl] = useState<string | null>(null);
  const [dreamVideoArtifactId, setDreamVideoArtifactId] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [uploadedImageOrigin, setUploadedImageOrigin] = useState<'manual' | 'generated' | null>(null);
  const [pendingGeneratedImage, setPendingGeneratedImage] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [imageGenerationDialogOpen, setImageGenerationDialogOpen] = useState(false);
  const [referenceImageDialogOpen, setReferenceImageDialogOpen] = useState(false);
  const storyboardOperationRef = useRef(0);
  const sceneOperationRef = useRef(0);
  const dreamOperationRef = useRef(0);
  const selectedImageModelRef = useRef<string | null>(null);
  const selectedVideoModelRef = useRef<string | null>(null);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;
  const decoratedImageModels = imageModels.map(decorateImageModel);
  const currentImageModel = decoratedImageModels.find((model) => model.id === selectedImageModel) ?? null;
  const decoratedVideoModels = videoModels.map(decorateVideoModel);
  const currentVideoModel = decoratedVideoModels.find((model) => model.id === selectedVideoModel) ?? null;
  const referenceImageDialogState = createReferenceImageDialogState(step);
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

  useEffect(() => {
    selectedVideoModelRef.current = selectedVideoModel;
  }, [selectedVideoModel]);

  useEffect(() => {
    selectedImageModelRef.current = selectedImageModel;
  }, [selectedImageModel]);

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

  const currentSnapshot = useCallback(
    () =>
      buildWorkflowStateSnapshot({
        step,
        storyboardGenerated,
        storyboardGenerating,
        selectedScene,
        customSceneUrl,
        aiSceneGenerated,
        aiSceneGenerating,
        dreaming,
      }),
    [
      aiSceneGenerated,
      aiSceneGenerating,
      customSceneUrl,
      dreaming,
      selectedScene,
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
    setSceneBackgroundAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
  }, []);

  const handlePatternUpload = useCallback((nextImage: string, file: File | null) => {
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
    setSelectedScene(resetState.selectedScene);
    setCustomSceneUrl(resetState.customSceneUrl);
    setAiSceneGenerated(resetState.aiSceneGenerated);
    setAiSceneGenerating(resetState.aiSceneGenerating);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
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
    setSelectedScene(resetState.selectedScene);
    setCustomSceneUrl(resetState.customSceneUrl);
    setAiSceneGenerated(resetState.aiSceneGenerated);
    setAiSceneGenerating(resetState.aiSceneGenerating);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, clearWorkflowMaterialRefs, currentSnapshot, selectedImageModel]);

  const handleSelectVideoModel = useCallback((modelId: string) => {
    setSelectedVideoModel(modelId);
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

  const handleGoToPreviousStep = useCallback(() => {
    setStep((current) => Math.max(current - 1, 0));
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleSelectPresetScene = useCallback((id: string) => {
    const resetState = resetWorkflowForSceneChange(currentSnapshot());
    setStep(resetState.step);
    setDreaming(resetState.dreaming);
    setSelectedScene(id);
    setCustomSceneUrl(null);
    setCustomSceneFile(null);
    setSceneBackgroundAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setAiSceneGenerated(false);
    setAiSceneGenerating(false);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

  const handleCustomSceneUpload = useCallback((url: string, file: File) => {
    const resetState = resetWorkflowForSceneChange(currentSnapshot());
    setStep(resetState.step);
    setDreaming(resetState.dreaming);
    setCustomSceneUrl(url);
    setCustomSceneFile(file);
    setSceneBackgroundAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setSelectedScene(null);
    setAiSceneGenerated(false);
    setAiSceneGenerating(false);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

  const handleAIGenerateScene = useCallback(async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (activationRequired) return;
    if (aiSceneGenerating) return;
    if (!selectedImageModel) {
      setRuntimeError(imageModelUnavailableMessage ?? '当前没有可用的生图模型。');
      return;
    }
    const operationId = sceneOperationRef.current + 1;
    sceneOperationRef.current = operationId;
    setAiSceneGenerating(true);
    setAiSceneGenerated(false);
    setSceneBackgroundAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setRuntimeStatus(null);
    setRuntimeError(null);
    try {
      const message = await runWorkflowAgent(prompt, {
        stage: 'scene',
        selectedImageModel,
        selectedScene,
        hasCustomScene: Boolean(customSceneUrl),
      }, 'AI 场景任务已完成，但没有返回可展示的结果说明。');
      if (sceneOperationRef.current !== operationId) return;
      setRuntimeStatus(message);
      setAiSceneGenerating(false);
      setAiSceneGenerated(true);
    } catch (error) {
      if (sceneOperationRef.current !== operationId) return;
      setAiSceneGenerating(false);
      setAiSceneGenerated(false);
      setRuntimeError(error instanceof Error ? error.message : 'AI 场景生成请求失败');
    }
  }, [
    activationRequired,
    imageModelUnavailableMessage,
    aiSceneGenerating,
    customSceneUrl,
    isLoggedIn,
    openLoginModal,
    prompt,
    runWorkflowAgent,
    selectedImageModel,
    selectedScene,
  ]);

  const handleAiSceneCancel = useCallback(() => {
    sceneOperationRef.current += 1;
    setAiSceneGenerating(false);
    setAiSceneGenerated(false);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleAiSceneRegenerate = useCallback(async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (activationRequired) return;
    if (aiSceneGenerating) return;
    if (!selectedImageModel) {
      setRuntimeError(imageModelUnavailableMessage ?? '当前没有可用的生图模型。');
      return;
    }
    const operationId = sceneOperationRef.current + 1;
    sceneOperationRef.current = operationId;
    setAiSceneGenerating(true);
    setAiSceneGenerated(false);
    setSceneBackgroundAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setRuntimeStatus(null);
    setRuntimeError(null);
    try {
      const message = await runWorkflowAgent(prompt, {
        stage: 'scene-regenerate',
        selectedImageModel,
        selectedScene,
        hasCustomScene: Boolean(customSceneUrl),
      }, 'AI 场景重新生成已完成，但没有返回可展示的结果说明。');
      if (sceneOperationRef.current !== operationId) return;
      setRuntimeStatus(message);
      setAiSceneGenerating(false);
      setAiSceneGenerated(true);
    } catch (error) {
      if (sceneOperationRef.current !== operationId) return;
      setAiSceneGenerating(false);
      setAiSceneGenerated(false);
      setRuntimeError(error instanceof Error ? error.message : 'AI 场景重新生成请求失败');
    }
  }, [
    activationRequired,
    imageModelUnavailableMessage,
    aiSceneGenerating,
    customSceneUrl,
    isLoggedIn,
    openLoginModal,
    prompt,
    runWorkflowAgent,
    selectedImageModel,
    selectedScene,
  ]);

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
      hasSceneBackgroundAsset: Boolean(sceneBackgroundAssetId),
      hasCustomSceneFile: Boolean(customSceneFile),
    });
    if (!materialReadiness.ready) {
      setRuntimeError(materialReadiness.message ?? '请补齐工作流视频材料。');
      return;
    }
    const operationId = dreamOperationRef.current + 1;
    dreamOperationRef.current = operationId;
    setStep(3);
    setDreaming(true);
    setRuntimeStatus(null);
    setRuntimeError(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    try {
      setRuntimeStatus('正在上传原图、保存分镜图和上传场景底图...');
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

      const sceneAssetId =
        sceneBackgroundAssetId ??
        (await uploadUserMedia({
          file: customSceneFile as File,
          title: '工作流场景底图',
        })).id;
      if (dreamOperationRef.current !== operationId) return;
      setSceneBackgroundAssetId(sceneAssetId);

      setRuntimeStatus('视频任务已提交，正在等待模型处理...');
      const { run } = await createAgentRun({
        taskType: 'workflow',
        prompt,
        input: {
          stage: 'workflow_video',
          modelId: selectedVideoModel,
          sourceImageAssetId: sourceAssetId,
          storyboardArtifactId: storyboardSavedAssetId,
          sceneBackgroundAssetId: sceneAssetId,
          storyboardPromptMap: {
            storyboardRunId,
            storyboardArtifactId,
            workflowPrompt: prompt,
            sourceImageOrigin: uploadedImageOrigin ?? 'manual',
            sceneMode: customSceneUrl ? 'custom' : selectedScene ? 'preset' : aiSceneGenerated ? 'ai' : 'unknown',
          },
          durationSeconds: videoConfig.defaults.durationSeconds ?? 5,
          resolution: videoConfig.defaults.resolution ?? '720p',
          styleCode: videoConfig.defaults.styleCode ?? undefined,
        },
      });
      if (run.status === 'failed') {
        throw new Error(run.errorMessage ?? '造梦请求失败');
      }
      if (dreamOperationRef.current !== operationId) return;

      setDreamRunId(run.id);
      const syncedRun = await syncAgentRun(run.id).catch(() => run);
      if (dreamOperationRef.current !== operationId) return;
      if (syncedRun.status === 'failed') {
        throw new Error(syncedRun.errorMessage ?? '视频生成请求失败');
      }
      if (syncedRun.status !== 'succeeded') {
        setRuntimeStatus('视频任务已提交，稍后可通过任务同步获取结果。');
        setDreaming(false);
        return;
      }

      const detail = await getAgentRunDetail(run.id);
      const artifact = detail.run.artifacts.find(
        (item) => item.kind === 'video' && item.status === 'ready',
      );
      if (!artifact) {
        setRuntimeStatus('视频任务已完成，但暂未找到可预览的视频结果。');
        setDreaming(false);
        return;
      }
      const access = await getGeneratedRunArtifactAccess(detail.run.id, artifact.id, 'preview');
      if (dreamOperationRef.current !== operationId) return;
      setDreamVideoUrl(access.url);
      setDreamVideoArtifactId(artifact.id);
      setRuntimeStatus('工作流视频已生成。');
      setDreaming(false);
    } catch (error) {
      if (dreamOperationRef.current !== operationId) return;
      setDreaming(false);
      setRuntimeError(error instanceof Error ? error.message : '造梦请求失败');
    }
  }, [
    activationRequired,
    aiSceneGenerated,
    customSceneFile,
    customSceneUrl,
    dreaming,
    isLoggedIn,
    openLoginModal,
    prompt,
    selectedScene,
    selectedVideoModel,
    sceneBackgroundAssetId,
    sourceImageAssetId,
    storyboardArtifactId,
    storyboardAssetId,
    storyboardRunId,
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
    setSelectedScene(nextState.resetState.selectedScene);
    setCustomSceneUrl(nextState.resetState.customSceneUrl);
    setAiSceneGenerated(nextState.resetState.aiSceneGenerated);
    setAiSceneGenerating(nextState.resetState.aiSceneGenerating);
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
    setSelectedScene(resetState.selectedScene);
    setCustomSceneUrl(resetState.customSceneUrl);
    setAiSceneGenerated(resetState.aiSceneGenerated);
    setAiSceneGenerating(resetState.aiSceneGenerating);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, clearWorkflowMaterialRefs, currentSnapshot, pendingGeneratedImage]);

  const handleRejectPendingGeneratedImage = useCallback(() => {
    setPendingGeneratedImage(null);
  }, []);

  const handleApplyReferenceScene = useCallback((sceneUrl: string) => {
    const nextState = applyGeneratedReferenceScene(currentSnapshot(), sceneUrl);
    setStep(nextState.step);
    setSelectedScene(nextState.selectedScene);
    setCustomSceneUrl(nextState.customSceneUrl);
    setCustomSceneFile(null);
    setSceneBackgroundAssetId(null);
    setDreamRunId(null);
    setDreamVideoUrl(null);
    setDreamVideoArtifactId(null);
    setAiSceneGenerated(nextState.aiSceneGenerated);
    setAiSceneGenerating(nextState.aiSceneGenerating);
    setDreaming(nextState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

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
      <ReferenceImageDialog
        open={referenceImageDialogOpen}
        onOpenChange={setReferenceImageDialogOpen}
        prompt={prompt}
        selectedImageModelId={selectedImageModel}
        isLoggedIn={isLoggedIn}
        activationRequired={activationRequired}
        openLoginModal={openLoginModal}
        onApply={handleApplyReferenceScene}
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
                  onClick={handleSubmitStoryboard}
                  disabled={!uploadedImage || imageModelLoading || !selectedImageModel || Boolean(imageModelUnavailableMessage)}
                  className={`w-full cursor-pointer rounded-xl py-3.5 text-sm font-medium transition-all ${
                    uploadedImage && !activationRequired && !imageModelLoading && selectedImageModel && !imageModelUnavailableMessage
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'cursor-not-allowed bg-secondary text-muted-foreground'
                  }`}
                >
                  {activationRequired ? '请先激活账号' : '提交生成分镜'}
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
                  selectedScene={selectedScene}
                  customSceneUrl={customSceneUrl}
                  aiSceneGenerating={aiSceneGenerating}
                  aiSceneGenerated={aiSceneGenerated}
                  onSelectPreset={handleSelectPresetScene}
                  onCustomUpload={handleCustomSceneUpload}
                  onAIGenerate={handleAIGenerateScene}
                  onAiSceneCancel={handleAiSceneCancel}
                  onAiSceneRegenerate={handleAiSceneRegenerate}
                  onStartDream={handleStartDream}
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
                    disabled={dreaming}
                    className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
                ) : (
                  <div className="rounded-xl border border-border bg-secondary/40 px-4 py-6 text-sm text-muted-foreground">
                    {dreamRunId
                      ? `造梦任务已提交，任务 ID：${dreamRunId}。你可以稍后同步任务结果。`
                      : '造梦任务已结束。你可以返回上一步继续调整场景、提示词或视频模型后重新开始。'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="lg:col-span-2 space-y-4">
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
                <button
                  type="button"
                  onClick={() => {
                    if (!referenceImageDialogState.disabled) {
                      setReferenceImageDialogOpen(true);
                    }
                  }}
                  disabled={referenceImageDialogState.disabled}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-2.5 text-left text-xs text-muted-foreground transition-all hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <Mountain size={12} /> 生成参考图
                  </span>
                  {referenceImageDialogState.message ? (
                    <span className="text-[10px] text-muted-foreground">{referenceImageDialogState.message}</span>
                  ) : null}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
