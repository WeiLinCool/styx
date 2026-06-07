'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  createAgentRun,
  getVideoGenerationConfig,
  type VideoGenerationConfigDto,
  type VideoModelOption,
} from '@/features/public/agent-runtime-client';
import { workflowImageModels } from '@/features/public/tool-data';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
} from '@/features/public/model-availability';
import {
  applyGeneratedReferenceScene,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
  resolveWorkflowVideoModelAvailability,
  type WorkflowStateSnapshot,
} from './workflow-state';
import { createReferenceImageDialogState } from './workflow-quick-actions';
import {
  PromptOptimizationDialog,
  ReferenceImageDialog,
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
function PatternUploadZone({ uploadedImage, onUpload }: { uploadedImage: string | null; onUpload: (dataUrl: string) => void }) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') onUpload(result);
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
    if (file) handleFile(file);
  }, [handleFile]);

  if (uploadedImage) {
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-2">
          <img src={uploadedImage} alt="已上传图案" className="mx-auto max-h-72 object-contain" />
          <div className="absolute top-3 right-3">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <Check size={12} />
              已上传
            </span>
          </div>
        </div>
        <button onClick={() => onUpload('')} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <RefreshCw size={12} />
          重新上传
        </button>
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
      onClick={() => document.getElementById('pattern-upload')?.click()}
    >
      <input id="pattern-upload" type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
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
function StoryboardSingleImage({ generating, generated, modelName, onCancel, onRegenerate, onNext }: {
  generating: boolean;
  generated: boolean;
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
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Film size={40} className="text-foreground/30" />
                <span className="text-sm font-medium text-foreground/50">12宫格分镜图</span>
                <span className="text-xs text-muted-foreground">由 {modelName} 生成</span>
              </div>
            </div>
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
  onCustomUpload: (url: string) => void;
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
    reader.onload = (ev) => { const result = ev.target?.result; if (typeof result === 'string') onCustomUpload(result); };
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
  const [selectedImageModel, setSelectedImageModel] = useState('gpt-image-2.0');
  const [videoConfig, setVideoConfig] = useState<VideoGenerationConfigDto>(emptyVideoConfig);
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [selectedVideoModel, setSelectedVideoModel] = useState<string | null>(null);
  const [videoModelAvailability, setVideoModelAvailability] = useState(createInitialModelAvailabilityState());
  const [storyboardGenerating, setStoryboardGenerating] = useState(false);
  const [storyboardGenerated, setStoryboardGenerated] = useState(false);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [customSceneUrl, setCustomSceneUrl] = useState<string | null>(null);
  const [aiSceneGenerating, setAiSceneGenerating] = useState(false);
  const [aiSceneGenerated, setAiSceneGenerated] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [dreaming, setDreaming] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [referenceImageDialogOpen, setReferenceImageDialogOpen] = useState(false);
  const storyboardOperationRef = useRef(0);
  const sceneOperationRef = useRef(0);
  const dreamOperationRef = useRef(0);
  const selectedVideoModelRef = useRef<string | null>(null);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;
  const currentImageModel = workflowImageModels.find((model) => model.id === selectedImageModel) as WorkflowModelCard | undefined;
  const decoratedVideoModels = videoModels.map(decorateVideoModel);
  const currentVideoModel = decoratedVideoModels.find((model) => model.id === selectedVideoModel) ?? null;
  const referenceImageDialogState = createReferenceImageDialogState(step);
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

  const handlePatternUpload = useCallback((nextImage: string) => {
    setUploadedImage(nextImage || null);
    const resetState = resetWorkflowForImageSourceChange(currentSnapshot());
    setStep(resetState.step);
    setStoryboardGenerated(resetState.storyboardGenerated);
    setStoryboardGenerating(resetState.storyboardGenerating);
    setSelectedScene(resetState.selectedScene);
    setCustomSceneUrl(resetState.customSceneUrl);
    setAiSceneGenerated(resetState.aiSceneGenerated);
    setAiSceneGenerating(resetState.aiSceneGenerating);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

  const handleSelectImageModel = useCallback((modelId: string) => {
    if (modelId === selectedImageModel) {
      return;
    }
    setSelectedImageModel(modelId);
    const resetState = resetWorkflowForImageSourceChange(currentSnapshot());
    setStep(resetState.step);
    setStoryboardGenerated(resetState.storyboardGenerated);
    setStoryboardGenerating(resetState.storyboardGenerating);
    setSelectedScene(resetState.selectedScene);
    setCustomSceneUrl(resetState.customSceneUrl);
    setAiSceneGenerated(resetState.aiSceneGenerated);
    setAiSceneGenerating(resetState.aiSceneGenerating);
    setDreaming(resetState.dreaming);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot, selectedImageModel]);

  const handleSelectVideoModel = useCallback((modelId: string) => {
    setSelectedVideoModel(modelId);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

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
    if (!isLoggedIn) { openLoginModal(); return; }
    if (activationRequired) return;
    if (!uploadedImage) return;
    if (storyboardGenerating) return;
    const operationId = storyboardOperationRef.current + 1;
    storyboardOperationRef.current = operationId;
    setStep(1);
    setStoryboardGenerating(true);
    setStoryboardGenerated(false);
    setRuntimeStatus(null);
    setRuntimeError(null);
    try {
      const message = await runWorkflowAgent(prompt, {
        stage: 'storyboard',
        imageModel: selectedImageModel,
        hasUploadedImage: Boolean(uploadedImage),
      }, '分镜任务已完成，但没有返回可展示的结果说明。');
      if (storyboardOperationRef.current !== operationId) return;
      setRuntimeStatus(message);
      setStoryboardGenerating(false);
      setStoryboardGenerated(true);
    } catch (error) {
      if (storyboardOperationRef.current !== operationId) return;
      setStoryboardGenerating(false);
      setStoryboardGenerated(false);
      setRuntimeError(error instanceof Error ? error.message : '分镜生成请求失败');
    }
  }, [activationRequired, isLoggedIn, openLoginModal, prompt, runWorkflowAgent, selectedImageModel, storyboardGenerating, uploadedImage]);

  const handleCancelStoryboard = useCallback(() => {
    storyboardOperationRef.current += 1;
    setStoryboardGenerating(false);
    setStoryboardGenerated(false);
    clearRuntimeFeedback();
    setStep(0);
  }, [clearRuntimeFeedback]);

  const handleRegenerateStoryboard = useCallback(async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (activationRequired) return;
    if (storyboardGenerating) return;
    const operationId = storyboardOperationRef.current + 1;
    storyboardOperationRef.current = operationId;
    setStoryboardGenerating(true);
    setStoryboardGenerated(false);
    setRuntimeStatus(null);
    setRuntimeError(null);
    try {
      const message = await runWorkflowAgent(prompt, {
        stage: 'storyboard-regenerate',
        imageModel: selectedImageModel,
        hasUploadedImage: Boolean(uploadedImage),
      }, '分镜重新生成已完成，但没有返回可展示的结果说明。');
      if (storyboardOperationRef.current !== operationId) return;
      setRuntimeStatus(message);
      setStoryboardGenerating(false);
      setStoryboardGenerated(true);
    } catch (error) {
      if (storyboardOperationRef.current !== operationId) return;
      setStoryboardGenerating(false);
      setStoryboardGenerated(false);
      setRuntimeError(error instanceof Error ? error.message : '分镜重新生成请求失败');
    }
  }, [activationRequired, isLoggedIn, openLoginModal, prompt, runWorkflowAgent, selectedImageModel, storyboardGenerating, uploadedImage]);

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
    setAiSceneGenerated(false);
    setAiSceneGenerating(false);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

  const handleCustomSceneUpload = useCallback((url: string) => {
    const resetState = resetWorkflowForSceneChange(currentSnapshot());
    setStep(resetState.step);
    setDreaming(resetState.dreaming);
    setCustomSceneUrl(url);
    setSelectedScene(null);
    setAiSceneGenerated(false);
    setAiSceneGenerating(false);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, currentSnapshot]);

  const handleAIGenerateScene = useCallback(async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (activationRequired) return;
    if (aiSceneGenerating) return;
    const operationId = sceneOperationRef.current + 1;
    sceneOperationRef.current = operationId;
    setAiSceneGenerating(true);
    setAiSceneGenerated(false);
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
  }, [activationRequired, aiSceneGenerating, customSceneUrl, isLoggedIn, openLoginModal, prompt, runWorkflowAgent, selectedImageModel, selectedScene]);

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
    const operationId = sceneOperationRef.current + 1;
    sceneOperationRef.current = operationId;
    setAiSceneGenerating(true);
    setAiSceneGenerated(false);
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
  }, [activationRequired, aiSceneGenerating, customSceneUrl, isLoggedIn, openLoginModal, prompt, runWorkflowAgent, selectedImageModel, selectedScene]);

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
    const operationId = dreamOperationRef.current + 1;
    dreamOperationRef.current = operationId;
    setStep(3);
    setDreaming(true);
    setRuntimeStatus(null);
    setRuntimeError(null);
    try {
      const message = await runWorkflowAgent(prompt, {
        stage: 'dream',
        videoModel: selectedVideoModel,
        selectedScene,
        hasCustomScene: Boolean(customSceneUrl),
        hasAiScene: aiSceneGenerated,
      }, '造梦任务已提交，但没有返回可展示的结果说明。');
      if (dreamOperationRef.current !== operationId) return;
      setRuntimeStatus(message);
      setDreaming(false);
    } catch (error) {
      if (dreamOperationRef.current !== operationId) return;
      setDreaming(false);
      setRuntimeError(error instanceof Error ? error.message : '造梦请求失败');
    }
  }, [
    activationRequired,
    aiSceneGenerated,
    customSceneUrl,
    dreaming,
    isLoggedIn,
    openLoginModal,
    prompt,
    runWorkflowAgent,
    selectedScene,
    selectedVideoModel,
    videoConfig.enabled,
    videoModelAvailability.status,
    videoModelUnavailableMessage,
  ]);

  const handleApplyOptimizedPrompt = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt);
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback]);

  const handleApplyReferenceScene = useCallback((sceneUrl: string) => {
    const nextState = applyGeneratedReferenceScene(currentSnapshot(), sceneUrl);
    setStep(nextState.step);
    setSelectedScene(nextState.selectedScene);
    setCustomSceneUrl(nextState.customSceneUrl);
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
                  <ModelSelector
                    models={workflowImageModels as WorkflowModelCard[]}
                    selectedModel={selectedImageModel}
                    onSelect={handleSelectImageModel}
                    title="选择生图模型"
                    icon={Zap}
                  />
                </div>
                <button
                  onClick={handleSubmitStoryboard}
                  disabled={!uploadedImage}
                  className={`w-full cursor-pointer rounded-xl py-3.5 text-sm font-medium transition-all ${
                    uploadedImage && !activationRequired
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
                  modelName={currentImageModel?.name || ''}
                  onCancel={handleCancelStoryboard}
                  onRegenerate={handleRegenerateStoryboard}
                  onNext={handleNextFromStoryboard}
                />
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
                ) : (
                  <div className="rounded-xl border border-border bg-secondary/40 px-4 py-6 text-sm text-muted-foreground">
                    造梦任务已结束。你可以返回上一步继续调整场景、提示词或视频模型后重新开始。
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 当前图片模型 */}
            {(step === 0 || step === 1) && currentImageModel && (
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
                <p className="mb-2 text-xs text-muted-foreground">当前生图模型</p>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${currentImageModel.logoBg}`}>
                    {currentImageModel.logo}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{currentImageModel.name}</p>
                    <p className="text-xs text-muted-foreground">{currentImageModel.desc}</p>
                  </div>
                </div>
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
