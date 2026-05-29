'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload, Wand2, ImageIcon, Sparkles, Layers,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import { createAgentRun } from '@/features/public/agent-runtime-client';
import { hdModels, imageModels, styleOptions, toolSizes } from '@/features/public/tool-data';

const TABS = [
  { id: 'generate', name: 'AI生图', icon: Sparkles },
  { id: 'hd-fix', name: '高清修复', icon: Layers },
  { id: 'style-transfer', name: '图片换风格', icon: Wand2 },
];

export default function ImageGenPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [activeTab, setActiveTab] = useState('generate');
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(imageModels[0].id);
  const [selectedSize, setSelectedSize] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [hdModel, setHdModel] = useState(hdModels[0].id);
  const [hdScale, setHdScale] = useState('2x');
  const [hdPrompt, setHdPrompt] = useState('高清修复，增强细节，提升画质，保留原始构图');
  const [selectedStyle, setSelectedStyle] = useState('stone-print');
  const [stylePrompt, setStylePrompt] = useState('');

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

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationMessage(null);

    try {
      const run = await createAgentRun({
        taskType: 'image',
        prompt: runPrompt,
        input: {
          mode: activeTab,
          model: activeTab === 'hd-fix' ? hdModel : selectedModel,
          size: selectedSize,
          hdScale,
          style: selectedStyle,
        },
      });
      if (run.status === 'failed') {
        setGenerationError(run.errorMessage ?? '图片生成请求失败');
        return;
      }
      setGenerationMessage(run.finalMessage ?? '图片任务已完成，但没有返回可展示的结果说明。');
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '图片生成请求失败');
    } finally {
      setIsGenerating(false);
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
              onClick={() => setActiveTab(tab.id)}
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
                  <div className="space-y-1.5">
                    {imageModels.map((model) => (
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
                <button onClick={handleGenerate} disabled={isGenerating} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium">
                  {isGenerating ? '生成中...' : '开始生成'}
                </button>
              </>
            )}

            {activeTab === 'hd-fix' && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium">上传图片</label>
                  <div className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-black/8 py-12 transition-colors hover:border-black/10">
                    <div className="text-center">
                      <Upload size={24} className="mx-auto mb-2 text-[#444444]" />
                      <p className="text-sm text-[#444444]">点击或拖拽上传</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">修复模型</label>
                  <div className="space-y-1.5">
                    {hdModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setHdModel(model.id)}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left transition-all ${
                          hdModel === model.id ? 'bg-black/5 border border-black/10' : 'border border-black/5 hover:border-black/8'
                        }`}
                      >
                        <div><div className="text-sm font-medium">{model.name}</div><div className="text-xs text-[#444444]">{model.desc}</div></div>
                        <div className="flex h-5 w-5 items-center justify-center">
                          {hdModel === model.id ? (
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
                <button onClick={handleGenerate} disabled={isGenerating} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium">
                  {isGenerating ? '修复中...' : '开始修复'}
                </button>
              </>
            )}

            {activeTab === 'style-transfer' && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium">上传图片</label>
                  <div className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-black/8 py-12 transition-colors hover:border-black/10">
                    <div className="text-center">
                      <Upload size={24} className="mx-auto mb-2 text-[#444444]" />
                      <p className="text-sm text-[#444444]">点击或拖拽上传</p>
                    </div>
                  </div>
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
                <button onClick={handleGenerate} disabled={isGenerating} className="apple-btn apple-btn-primary w-full cursor-pointer rounded-xl py-3 text-sm font-medium">
                  {isGenerating ? '转换中...' : '开始换风格'}
                </button>
              </>
            )}
          </div>

          {/* Right - Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white/[0.02] p-8">
            {isGenerating ? (
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
