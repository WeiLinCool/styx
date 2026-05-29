'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play, Volume2, VolumeX, Film, ImageIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import { createAgentRun } from '@/features/public/agent-runtime-client';
import { videoModels } from '@/features/public/tool-data';

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
  const [selectedModel, setSelectedModel] = useState(videoModels[2].id);
  const [selectedStyle, setSelectedStyle] = useState('石头印画');
  const [selectedDuration, setSelectedDuration] = useState('5秒');
  const [selectedClarity, setSelectedClarity] = useState('720P');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    if (isGenerating) return;
    if (!prompt.trim()) {
      setGenerationMessage(null);
      setGenerationError('请输入提示词后再开始生成。');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationMessage(null);

    try {
      const run = await createAgentRun({
        taskType: 'video',
        prompt: prompt.trim(),
        input: {
          model: selectedModel,
          style: selectedStyle,
          duration: selectedDuration,
          clarity: selectedClarity,
          audioEnabled,
        },
      });
      if (run.status === 'failed') {
        setGenerationError(run.errorMessage ?? '视频生成请求失败');
        return;
      }
      setGenerationMessage(run.finalMessage ?? '视频任务已完成，但没有返回可展示的结果说明。');
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '视频生成请求失败');
    } finally {
      setIsGenerating(false);
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
                        {model.badge && <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">{model.badge}</span>}
                      </div>
                      <div className="text-xs text-[#444444]">{model.desc}</div>
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

            <button onClick={handleGenerate} disabled={isGenerating} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium">
              {isGenerating ? '生成中...' : '开始生成'}
            </button>
          </div>

          {/* Right - Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white/[0.02] p-8">
            {isGenerating ? (
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
