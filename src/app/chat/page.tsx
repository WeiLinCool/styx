'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Send, Bot, Copy, RotateCcw, Menu, X, User, MessageSquare, Lightbulb, Code, PenTool, Globe, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  AgentRuntimeApiError,
  createAgentRun,
  listAgentRuns,
  listChatModels,
  selectChatModelId,
  type ChatModelOption,
} from '@/features/public/agent-runtime-client';
import type { AgentRunDto } from '@/server/agent/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelLabel?: string;
  billingLabel?: string;
  usageLabel?: string;
  timestamp: number;
}

type ConversationSummary = {
  id: string;
  title: string;
  time: string;
};

const quickPrompts = [
  { icon: Lightbulb, text: '帮我设计一个石头印画作品' },
  { icon: Code, text: '写一段AI视频生成提示词' },
  { icon: PenTool, text: '生成石头印画分镜脚本' },
  { icon: Globe, text: '如何用AI做短视频获客？' },
];

const chatModelSelectionStorageKey = 'styx.chat.selectedModelId';

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRunDto[]>([]);
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setRecentRuns([]);
      setChatModels([]);
      setSelectedModelId(null);
      return;
    }

    async function loadChatState() {
      setModelLoading(true);
      try {
        const [models, runs] = await Promise.all([listChatModels(), listAgentRuns()]);
        const chatRuns = runs.filter((run) => run.taskType === 'chat');
        const storedModelId =
          typeof window === 'undefined' ? null : window.localStorage.getItem(chatModelSelectionStorageKey);
        const nextModelId = selectChatModelId(models, storedModelId);

        setChatModels(models);
        setSelectedModelId(nextModelId);
        setRecentRuns(chatRuns);
        setMessages(mapRunsToMessages(chatRuns));
      } catch (error) {
        setErrorMessage(readRuntimeErrorMessage(error, '对话数据加载失败'));
      } finally {
        setModelLoading(false);
      }
    }

    void loadChatState();
  }, [isLoggedIn, user]);

  const selectedModel = chatModels.find((model) => model.id === selectedModelId) ?? null;

  const handleModelChange = (modelId: string) => {
    const nextModelId = selectChatModelId(chatModels, modelId);
    setSelectedModelId(nextModelId);
    if (nextModelId) {
      window.localStorage.setItem(chatModelSelectionStorageKey, nextModelId);
    } else {
      window.localStorage.removeItem(chatModelSelectionStorageKey);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (isSubmitting) return;
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    if (!selectedModelId) {
      setErrorMessage(modelLoading ? '模型列表加载中' : '当前账号没有可用模型');
      return;
    }

    const prompt = input.trim();
    const now = Date.now();
    msgCounter.current += 1;
    const userMsg: Message = {
      id: `msg-${now}-${msgCounter.current}`,
      role: 'user',
      content: prompt,
      timestamp: now,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const run = await createAgentRun({ taskType: 'chat', prompt, modelId: selectedModelId });
      if (run.status === 'failed') {
        setErrorMessage(run.errorMessage ?? 'AI 请求失败');
        return;
      }
      const runs = await listAgentRuns();
      const chatRuns = runs.filter((item) => item.taskType === 'chat');
      setRecentRuns(chatRuns);
      setMessages(mapRunsToMessages(chatRuns));
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, 'AI 请求失败'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const conversations = recentRuns.map(mapRunToConversationSummary);

  return (
    <div className="flex h-screen bg-white text-[#1d1d1f]">
      {/* 侧边栏 - 桌面 */}
      {sidebarOpen && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-black/5 bg-[#f5f5f7] md:flex">
          <div className="flex items-center justify-between border-b border-black/5 p-4">
            <Link href="/home" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
                <svg width="12" height="12" viewBox="0 0 40 40" fill="none"><path d="M20 4L8 12V28L20 36L32 28V12L20 4Z" fill="black" /><circle cx="20" cy="20" r="4" fill="white" /></svg>
              </div>
              <span className="text-sm font-semibold">AI对话</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="cursor-pointer text-[#444444] hover:text-[#1d1d1f]"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <button
              onClick={() => setMessages([])}
              className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-black/8 px-3 py-2.5 text-sm text-[#555555] transition-colors hover:border-black/10 hover:text-[#1d1d1f]"
            >
              + 新对话
            </button>
            {conversations.map((c) => (
              <div key={c.id} className="mb-1 rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f]">
                <div className="truncate font-medium">{c.title}</div>
                <div className="text-[11px] text-[#999]">{c.time}</div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* 主区域 */}
      <div className="flex flex-1 flex-col">
        {/* 顶栏 */}
        <header className="flex h-12 items-center justify-between border-b border-black/5 px-4">
          <div className="flex items-center gap-3">
            <Link href="/home" className="flex items-center gap-1 text-[#555555] transition-colors hover:text-[#1d1d1f]">
              <ArrowLeft size={16} />
              <span className="text-xs">返回</span>
            </Link>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="cursor-pointer text-[#444444] hover:text-[#1d1d1f]"><Menu size={18} /></button>
            )}
            <span className="text-sm font-medium">AI对话</span>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn && user ? (
              <div className="flex items-center gap-2">
                <UserAvatar avatar={user.avatar} size={24} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                <span className="text-xs text-[#555555]">{user.nickname}</span>
              </div>
            ) : (
              <button onClick={openLoginModal} className="apple-btn apple-btn-primary cursor-pointer rounded-full px-3 py-1 text-xs">登录</button>
            )}
          </div>
        </header>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4">
              {isLoggedIn && user && requiresActivation(user) ? (
                <ProtectedAccountPanel accountState={user.accountState} title="激活账号后开始 AI 对话" />
              ) : (
                <>
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5">
                    <Bot size={24} className="text-[#444444]" />
                  </div>
                  <h2 className="mb-2 text-lg font-semibold text-[#1d1d1f]">开始对话</h2>
                  <p className="mb-8 text-sm text-[#444444]">向AI助手提问石头印画创作和AI视频工作流</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickPrompts.map((qp) => (
                      <button
                        key={qp.text}
                        onClick={() => { setInput(qp.text); }}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/5 bg-white px-4 py-3 text-left text-sm text-[#444444] transition-colors hover:border-black/8 hover:bg-[#f5f5f7]"
                      >
                        <qp.icon size={16} className="shrink-0 text-[#444444]" />
                        {qp.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1 p-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#1d1d1f] text-white'
                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                  }`}>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    {(msg.modelLabel || msg.billingLabel || msg.usageLabel) && (
                      <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] ${
                        msg.role === 'user'
                          ? 'border-white/15 text-white/70'
                          : 'border-black/5 text-[#6e6e73]'
                      }`}>
                        {msg.modelLabel && <span>{msg.modelLabel}</span>}
                        {msg.billingLabel && <span>{msg.billingLabel}</span>}
                        {msg.usageLabel && <span>{msg.usageLabel}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-black/5 p-4">
          {errorMessage && (
            <p className="mb-2 text-sm text-red-500">{errorMessage}</p>
          )}
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="sr-only" htmlFor="chat-model-selector">聊天模型</label>
            <select
              id="chat-model-selector"
              value={selectedModelId ?? ''}
              onChange={(event) => handleModelChange(event.target.value)}
              disabled={modelLoading || chatModels.length === 0 || isSubmitting}
              className="h-9 w-full min-w-0 rounded-lg border border-black/10 bg-white px-3 text-xs text-[#1d1d1f] outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#f5f5f7] disabled:text-[#999999] sm:w-[360px]"
              title={selectedModel ? `${selectedModel.name} · ${selectedModel.entitlementLabel} · ${selectedModel.pricingSummary}` : undefined}
            >
              {chatModels.length === 0 ? (
                <option value="">{modelLoading ? '模型加载中' : '无可用模型'}</option>
              ) : (
                chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.entitlementLabel} · {model.pricingSummary}
                  </option>
                ))
              )}
            </select>
            {selectedModel && (
              <div className="min-w-0 text-xs text-[#6e6e73] sm:text-right">
                <span className="block truncate">{selectedModel.providerName}</span>
                <span className="block truncate">{selectedModel.entitlementLabel} · {selectedModel.pricingSummary}</span>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              disabled={isSubmitting || modelLoading || chatModels.length === 0}
              className="flex-1 rounded-xl border border-black/8 bg-white/[0.03] px-4 py-2.5 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none transition-colors focus:border-black/10"
            />
            <button type="submit" disabled={isSubmitting || modelLoading || chatModels.length === 0} className="apple-btn apple-btn-primary cursor-pointer rounded-xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* 移动端菜单 */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-64 bg-[#f5f5f7] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold">对话列表</span>
              <button onClick={() => setMobileMenuOpen(false)} className="cursor-pointer text-[#444444]"><X size={18} /></button>
            </div>
            {conversations.map((c) => (
              <div key={c.id} className="mb-1 rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f]">
                <div className="truncate">{c.title}</div>
                <div className="text-[11px] text-[#6e6e73]">{c.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function mapRunsToMessages(runs: AgentRunDto[]): Message[] {
  return runs
    .slice()
    .reverse()
    .flatMap((run) => {
      const created = new Date(run.createdAt).getTime();
      const items: Message[] = [
        {
          id: `${run.id}-user`,
          role: 'user',
          content: run.prompt,
          timestamp: created,
        },
      ];

      if (run.finalMessage) {
        items.push({
          id: `${run.id}-assistant`,
          role: 'assistant',
          content: run.finalMessage,
          modelLabel: formatModelLabel(run),
          billingLabel: formatBillingLabel(run),
          usageLabel: formatUsageLabel(run),
          timestamp: new Date(run.updatedAt).getTime(),
        });
      }

      return items;
    });
}

function formatModelLabel(run: AgentRunDto) {
  const modelName = run.selectedModel?.name ?? run.capabilitySummary.model;
  return modelName ? `模型：${modelName}` : undefined;
}

function formatBillingLabel(run: AgentRunDto) {
  if (!run.billing) {
    return undefined;
  }

  if (typeof run.billing.creditCost === 'number') {
    return `消耗：${run.billing.creditCost} 积分`;
  }

  return `计费：${run.billing.status}`;
}

function formatUsageLabel(run: AgentRunDto) {
  if (!run.usage) {
    return undefined;
  }

  return `用量：${run.usage.totalTokens} tokens`;
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

function mapRunToConversationSummary(run: AgentRunDto): ConversationSummary {
  return {
    id: run.id,
    title: run.prompt.length > 18 ? `${run.prompt.slice(0, 18)}...` : run.prompt,
    time: new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(run.createdAt)),
  };
}
