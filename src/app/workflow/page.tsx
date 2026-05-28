'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import { workflowImageModels, workflowVideoModels } from '@/features/public/tool-data';
import {
  ArrowLeft,
  Upload,
  Wand2,
  Download,
  ChevronRight,
  Check,
  Film,
  RotateCcw,
  Volume2,
  Share2,
  User,
  Menu,
  X,
  Workflow,
  Pencil,
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

// 导航栏
function WorkflowNav() {
  const { user, isLoggedIn } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-black/[0.06] bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1 text-[#555555] transition-colors hover:text-[#1d1d1f]">
            <ArrowLeft size={18} />
            <span className="hidden text-sm sm:inline">返回首页</span>
          </Link>
          <div className="h-4 w-px bg-black/10" />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f5f5f7]">
              <Workflow size={14} className="text-[#1d1d1f]" />
            </div>
            <span className="text-sm font-semibold text-[#1d1d1f]">AI视频工作流</span>
          </div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f7]">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.nickname} className="h-full w-full object-cover" />
                ) : (
                  <User size={14} className="text-[#1d1d1f]" />
                )}
              </div>
              <span className="text-xs text-[#1d1d1f]">{user.nickname}</span>
            </div>
          ) : (
            <Link href="/home" className="rounded-full border border-black/[0.08] bg-black/[0.03] px-4 py-1.5 text-xs font-medium text-[#1d1d1f] backdrop-blur-md transition-all hover:bg-black/[0.06]">
              登录
            </Link>
          )}
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="cursor-pointer text-[#1d1d1f] sm:hidden">
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
        <div className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-white p-2">
          <img src={uploadedImage} alt="已上传图案" className="mx-auto max-h-72 object-contain" />
          <div className="absolute top-3 right-3">
            <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-[#555555] shadow-sm border border-black/[0.06]">
              <Check size={12} />
              已上传
            </span>
          </div>
        </div>
        <button onClick={() => onUpload('')} className="flex cursor-pointer items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-[#555555]">
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
        dragOver ? 'border-[#1d1d1f] bg-[#f5f5f7]' : 'border-black/10 bg-[#fafafa] hover:border-black/20'
      }`}
      onClick={() => document.getElementById('pattern-upload')?.click()}
    >
      <input id="pattern-upload" type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f5f5f7] border border-black/[0.06]">
        <Upload size={28} className="text-[#555555]" />
      </div>
      <p className="mb-2 text-base font-medium text-[#1d1d1f]">拖拽图案到此处或点击上传</p>
      <p className="text-sm text-[#9ca3af]">支持 JPG、PNG 格式的石头印画图案</p>
    </div>
  );
}

// 模型选择器（通用）
function ModelSelector({ models, selectedModel, onSelect, title, icon: Icon }: {
  models: typeof workflowImageModels | typeof workflowVideoModels;
  selectedModel: string;
  onSelect: (id: string) => void;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f]">
        <Icon size={14} className="text-[#555555]" />
        {title}
      </div>
      <div className="space-y-2">
        {models.map((model) => {
          const m = model as typeof workflowImageModels[number] & typeof workflowVideoModels[number];
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                selectedModel === m.id
                  ? 'border-[#1d1d1f] bg-[#f5f5f7] shadow-sm'
                  : 'border-black/[0.06] bg-white hover:border-black/15 hover:shadow-sm'
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${m.logoBg} ${selectedModel === m.id ? 'ring-1 ring-black/10' : ''}`}>
                {m.logo}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#1d1d1f]">{m.name}</span>
                  {m.badge && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.badgeColor}`}>
                      {m.badge}
                    </span>
                  )}
                  {m.vip && (
                    <span className="flex items-center gap-0.5 text-[10px] text-[#555555]">
                      <Crown size={10} />
                      VIP
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-[#9ca3af]">{m.desc}</p>
              </div>
              {selectedModel === m.id && (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f]">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
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
        <div className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-[#f5f5f7]/80 p-4 backdrop-blur-md">
          <Loader2 size={20} className="animate-spin text-[#1d1d1f]" />
          <div>
            <p className="text-sm font-medium text-[#1d1d1f]">正在为您生成12宫格分镜图</p>
            <p className="text-xs text-[#9ca3af]">{modelName} 正在创作中...</p>
          </div>
        </div>

        {/* 单张分镜图生成中 */}
        <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-[#fafafa]">
          <div className="relative aspect-[4/3] w-full">
            {/* 渐现效果 - 从左到右逐渐显现 */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#f5f5f7] to-[#ebebed] transition-opacity duration-1000"
              style={{ opacity: progress / 100 }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              {progress < 100 ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={28} className="animate-spin text-[#1d1d1f]/30" />
                  <span className="text-xs text-[#9ca3af]">{progress}%</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Film size={32} className="text-[#1d1d1f]/40" />
                  <span className="text-sm font-medium text-[#1d1d1f]/60">分镜图</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9ca3af]">生成进度</span>
            <span className="font-medium text-[#1d1d1f]">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f5f5f7]">
            <div className="h-full rounded-full bg-[#1d1d1f] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button onClick={onCancel} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white py-2.5 text-sm text-[#555555] transition-colors hover:border-black/15 hover:text-[#1d1d1f]">
          <XCircle size={14} />
          取消生成
        </button>
      </div>
    );
  }

  if (generated) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#f5f5f7]/80 p-3 backdrop-blur-md">
          <Check size={16} className="text-[#1d1d1f]" />
          <span className="text-sm font-medium text-[#1d1d1f]">12宫格分镜图已生成</span>
          <span className="ml-auto text-xs text-[#9ca3af]">{modelName}</span>
        </div>

        {/* 单张分镜图 - 整体展示 */}
        <div className="group relative overflow-hidden rounded-xl border border-black/[0.06] bg-white">
          <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-[#f5f5f7] to-[#ebebed]">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Film size={40} className="text-[#1d1d1f]/30" />
                <span className="text-sm font-medium text-[#1d1d1f]/50">12宫格分镜图</span>
                <span className="text-xs text-[#9ca3af]">由 {modelName} 生成</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#9ca3af]">整张分镜图由 {modelName} 一次生成</p>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button onClick={onRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white py-3 text-sm text-[#555555] transition-all hover:border-black/15 hover:text-[#1d1d1f]">
            <RefreshCw size={14} />
            重新生成
          </button>
          <button onClick={onNext} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] py-3 text-sm font-medium text-white transition-all hover:bg-[#333]">
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
                ? 'border-[#1d1d1f] bg-[#1d1d1f] text-white'
                : 'border-black/[0.06] bg-white text-[#555555] hover:border-black/15'
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
                  ? 'border-[#1d1d1f] bg-[#f5f5f7] shadow-sm'
                  : 'border-black/[0.06] bg-white hover:border-black/15'
              }`}
            >
              <span className="text-xl">{scene.icon}</span>
              <span className="text-xs font-medium text-[#1d1d1f]">{scene.name}</span>
              <span className="text-[10px] text-[#9ca3af]">{scene.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* 自定义上传 */}
      {sceneMode === 'custom' && (
        <div className="space-y-3">
          {customSceneUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-white p-2">
              <img src={customSceneUrl} alt="自定义场景" className="mx-auto max-h-56 object-contain" />
              <div className="absolute top-2 right-2">
                <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs text-[#555555] border border-black/[0.06]">
                  <Check size={10} />
                  已选择
                </span>
              </div>
            </div>
          ) : (
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/10 bg-[#fafafa] p-8 transition-all hover:border-black/20"
              onClick={() => document.getElementById('scene-custom-upload')?.click()}
            >
              <input id="scene-custom-upload" type="file" accept="image/*" className="hidden" onChange={handleCustomFile} />
              <Upload size={24} className="mb-2 text-[#9ca3af]" />
              <p className="text-sm text-[#1d1d1f]">上传自定义场景图</p>
              <p className="mt-1 text-xs text-[#9ca3af]">JPG、PNG 格式</p>
            </div>
          )}
        </div>
      )}

      {/* AI生成场景 */}
      {sceneMode === 'ai' && (
        <div className="space-y-3">
          {aiSceneGenerating ? (
            <div className="space-y-3">
              <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-black/[0.06] bg-[#f5f5f7]/80 backdrop-blur-md">
                <Loader2 size={32} className="mb-3 animate-spin text-[#1d1d1f]" />
                <p className="text-sm font-medium text-[#1d1d1f]">AI正在生成场景...</p>
                <p className="mt-1 text-xs text-[#9ca3af]">{aiProgress}%</p>
                <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-black/[0.06]">
                  <div className="h-full rounded-full bg-[#1d1d1f] transition-all" style={{ width: `${aiProgress}%` }} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onAiSceneCancel} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white py-2 text-xs text-[#555555] hover:border-black/15">
                  <XCircle size={12} /> 取消
                </button>
                <button onClick={onAiSceneRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white py-2 text-xs text-[#555555] hover:border-black/15">
                  <RefreshCw size={12} /> 重新生成
                </button>
              </div>
            </div>
          ) : aiSceneGenerated ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-[#1d1d1f] bg-[#f5f5f7] p-2 shadow-sm">
                <div className="flex aspect-[16/10] items-center justify-center">
                  <div className="text-center">
                    <Mountain size={32} className="mx-auto mb-2 text-[#9ca3af]/60" />
                    <p className="text-sm text-[#555555]">AI生成的场景图</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onAiSceneRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white py-2 text-xs text-[#555555] hover:border-black/15">
                  <RefreshCw size={12} /> 重新生成
                </button>
              </div>
            </div>
          ) : (
            <button onClick={onAIGenerate} className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 bg-[#fafafa] p-8 transition-all hover:border-black/20 hover:bg-[#f5f5f7]">
              <Sparkles size={28} className="text-[#9ca3af]" />
              <p className="text-sm font-medium text-[#1d1d1f]">点击生成AI场景</p>
              <p className="text-xs text-[#9ca3af]">根据上传的图案自动生成匹配的场景</p>
            </button>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {isSceneReady && (
        <div className="flex gap-3 pt-2">
          <button onClick={onAiSceneCancel} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white py-3 text-sm text-[#555555] transition-all hover:border-black/15 hover:text-[#1d1d1f]">
            取消
          </button>
          <button onClick={onAiSceneRegenerate} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white py-3 text-sm text-[#555555] transition-all hover:border-black/15 hover:text-[#1d1d1f]">
            <RefreshCw size={14} />
            重新生成
          </button>
          <button onClick={onStartDream} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] py-3 text-sm font-medium text-white transition-all hover:bg-[#333]">
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
      <div className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-[#f5f5f7]/80 backdrop-blur-md">
        <div className="flex aspect-video flex-col items-center justify-center p-8">
          <div className="relative mb-4 h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-[#f5f5f7] border-t-[#1d1d1f]" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Film size={24} className="text-[#1d1d1f]" />
            </div>
          </div>
          <p className="text-lg font-semibold text-[#1d1d1f]">Seedance 2.0 正在造梦</p>
          <p className="mt-1 text-sm text-[#9ca3af]">AI视频生成中，请稍候...</p>
          <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[#1d1d1f] transition-all" style={{ width: `${dreamProgress}%` }} />
          </div>
          <p className="mt-2 text-xs text-[#9ca3af]">{Math.round(dreamProgress)}%</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white py-3 text-sm text-[#555555] hover:border-black/15">
          <XCircle size={14} /> 取消
        </button>
      </div>
    </div>
  );
}

// 主页面
export default function WorkflowPage() {
  const { user, isLoggedIn } = useAuth();
  const [step, setStep] = useState(0); // 0: upload, 1: storyboard, 2: scene, 3: dream
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedImageModel, setSelectedImageModel] = useState('gpt-image-2.0');
  const [selectedVideoModel, setSelectedVideoModel] = useState('seedance-2.0-fast');
  const [storyboardGenerating, setStoryboardGenerating] = useState(false);
  const [storyboardGenerated, setStoryboardGenerated] = useState(false);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [customSceneUrl, setCustomSceneUrl] = useState<string | null>(null);
  const [aiSceneGenerating, setAiSceneGenerating] = useState(false);
  const [aiSceneGenerated, setAiSceneGenerated] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [dreaming, setDreaming] = useState(false);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;

  const currentImageModel = workflowImageModels.find(m => m.id === selectedImageModel);
  const currentVideoModel = workflowVideoModels.find(m => m.id === selectedVideoModel);

  const handleSubmitStoryboard = useCallback(() => {
    if (activationRequired) return;
    if (!uploadedImage) return;
    setStep(1);
    setStoryboardGenerating(true);
    setStoryboardGenerated(false);
    setTimeout(() => {
      setStoryboardGenerating(false);
      setStoryboardGenerated(true);
    }, 6000);
  }, [activationRequired, uploadedImage]);

  const handleCancelStoryboard = useCallback(() => {
    setStoryboardGenerating(false);
    setStoryboardGenerated(false);
    setStep(0);
  }, []);

  const handleRegenerateStoryboard = useCallback(() => {
    if (activationRequired) return;
    setStoryboardGenerating(true);
    setStoryboardGenerated(false);
    setTimeout(() => {
      setStoryboardGenerating(false);
      setStoryboardGenerated(true);
    }, 6000);
  }, [activationRequired]);

  const handleNextFromStoryboard = useCallback(() => {
    setStep(2);
  }, []);

  const handleSelectPresetScene = useCallback((id: string) => {
    setSelectedScene(id);
    setCustomSceneUrl(null);
    setAiSceneGenerated(false);
  }, []);

  const handleCustomSceneUpload = useCallback((url: string) => {
    setCustomSceneUrl(url);
    setSelectedScene(null);
    setAiSceneGenerated(false);
  }, []);

  const handleAIGenerateScene = useCallback(() => {
    if (activationRequired) return;
    setAiSceneGenerating(true);
    setAiSceneGenerated(false);
    setTimeout(() => {
      setAiSceneGenerating(false);
      setAiSceneGenerated(true);
    }, 4000);
  }, [activationRequired]);

  const handleAiSceneCancel = useCallback(() => {
    setAiSceneGenerating(false);
    setAiSceneGenerated(false);
  }, []);

  const handleAiSceneRegenerate = useCallback(() => {
    if (activationRequired) return;
    setAiSceneGenerating(true);
    setAiSceneGenerated(false);
    setTimeout(() => {
      setAiSceneGenerating(false);
      setAiSceneGenerated(true);
    }, 4000);
  }, [activationRequired]);

  const handleStartDream = useCallback(() => {
    if (activationRequired) return;
    setStep(3);
    setDreaming(true);
  }, [activationRequired]);

  const steps = [
    { label: '上传图案', icon: Upload },
    { label: '12宫格分镜', icon: Film },
    { label: '选择场景', icon: Mountain },
    { label: '开始造梦', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-white">
      <WorkflowNav />

      <div className="mx-auto max-w-7xl px-4 pt-20 pb-12 sm:px-6">
        {activationRequired && (
          <ProtectedAccountPanel accountState={user?.accountState} title="激活账号后使用 AI 工作流" />
        )}
        {/* 步骤条 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                  step === i ? 'border-[#1d1d1f] bg-[#1d1d1f] text-white' :
                  step > i ? 'border-[#1d1d1f] bg-[#f5f5f7] text-[#1d1d1f]' :
                  'border-black/[0.06] bg-white text-[#9ca3af]'
                }`}>
                  <s.icon size={14} />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-2 h-px w-8 sm:w-16 ${step > i ? 'bg-[#1d1d1f]' : 'bg-black/[0.06]'}`} />
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
                <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-6">
                  <h2 className="mb-4 text-lg font-semibold text-[#1d1d1f]">上传图案</h2>
                  <PatternUploadZone uploadedImage={uploadedImage} onUpload={setUploadedImage} />
                </div>
                <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-6">
                  <ModelSelector models={workflowImageModels} selectedModel={selectedImageModel} onSelect={setSelectedImageModel} title="选择生图模型" icon={Zap} />
                </div>
                <button
                  onClick={handleSubmitStoryboard}
                  disabled={!uploadedImage}
                  className={`w-full cursor-pointer rounded-xl py-3.5 text-sm font-medium transition-all ${
                    uploadedImage && !activationRequired
                      ? 'bg-[#1d1d1f] text-white hover:bg-[#333]'
                      : 'bg-[#f5f5f7] text-[#9ca3af] cursor-not-allowed'
                  }`}
                >
                  {activationRequired ? '请先激活账号' : '提交生成分镜'}
                </button>
              </div>
            )}

            {/* Step 1: 12宫格分镜图 */}
            {step === 1 && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-6">
                <h2 className="mb-4 text-lg font-semibold text-[#1d1d1f]">12宫格分镜图</h2>
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
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-6">
                <h2 className="mb-4 text-lg font-semibold text-[#1d1d1f]">选择场景</h2>
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
            {step === 3 && dreaming && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-6">
                <h2 className="mb-4 text-lg font-semibold text-[#1d1d1f]">开始造梦</h2>
                <DreamGeneration videoModel={currentVideoModel?.name || ''} />
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 当前图片模型 */}
            {(step === 0 || step === 1) && currentImageModel && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-5">
                <p className="mb-2 text-xs text-[#9ca3af]">当前生图模型</p>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${currentImageModel.logoBg}`}>
                    {currentImageModel.logo}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">{currentImageModel.name}</p>
                    <p className="text-xs text-[#9ca3af]">{currentImageModel.desc}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 提示词 + 视频模型（Step 2+） */}
            {(step === 2 || step === 3) && (
              <>
                <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-[#1d1d1f]">提示词</p>
                    <button onClick={() => setPrompt(DEFAULT_PROMPT)} className="flex cursor-pointer items-center gap-1 text-xs text-[#9ca3af] hover:text-[#1d1d1f]">
                      <RotateCcw size={10} />
                      恢复默认
                    </button>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-black/[0.06] bg-[#fafafa] p-3 text-sm text-[#1d1d1f] placeholder-[#9ca3af] focus:border-[#1d1d1f] focus:outline-none"
                  />
                </div>
                <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-5">
                  <ModelSelector models={workflowVideoModels} selectedModel={selectedVideoModel} onSelect={setSelectedVideoModel} title="视频生成模型" icon={Film} />
                </div>
              </>
            )}

            {/* 预览区 */}
            {(step === 0 && uploadedImage) && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-md p-5">
                <p className="mb-2 text-xs text-[#9ca3af]">图案预览</p>
                <div className="overflow-hidden rounded-xl border border-black/[0.06]">
                  <img src={uploadedImage} alt="预览" className="mx-auto max-h-48 object-contain" />
                </div>
              </div>
            )}

            {/* 快捷操作 */}
            <div className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7]/50 backdrop-blur-md p-5">
              <p className="mb-3 text-sm font-medium text-[#1d1d1f]">快捷操作</p>
              <div className="space-y-2">
                <Link href="/chat" className="flex items-center gap-2 rounded-lg border border-black/[0.04] bg-white p-2.5 text-xs text-[#555555] transition-all hover:border-black/10 hover:text-[#1d1d1f]">
                  <Wand2 size={12} /> AI对话优化提示词
                </Link>
                <Link href="/image-gen" className="flex items-center gap-2 rounded-lg border border-black/[0.04] bg-white p-2.5 text-xs text-[#555555] transition-all hover:border-black/10 hover:text-[#1d1d1f]">
                  <Mountain size={12} /> 生成参考图
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
