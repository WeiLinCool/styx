'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Send, Bot, Menu, X, Lightbulb, Code, PenTool, Globe, ArrowLeft, Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatCredits } from '@/lib/credits';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import {
  AgentRuntimeApiError,
  createAgentRun,
  createAgentRunEventsUrl,
  deleteAgentRun,
  getAgentRunDetail,
  listAgentRuns,
  listChatModels,
  selectChatModelId,
  type ChatModelOption,
} from '@/features/public/agent-runtime-client';
import { ChatMarkdown } from '@/features/public/chat-markdown';
import { formatChatModelLabel } from '@/features/public/chat-message-format';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
  reconcileSelectedModelId,
} from '@/features/public/model-availability';
import type { AgentRunDetailDto, AgentRunDto } from '@/server/agent/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
  modelLabel?: string;
  billingLabel?: string;
  usageLabel?: string;
  timestamp: number;
}

type ConversationSummary = {
  id: string;
  conversationId: string;
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
const longAssistantMessageThreshold = 1200;

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRunDto[]>([]);
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelAvailability, setModelAvailability] = useState(createInitialModelAvailabilityState());
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
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
      setMessages([]);
      setModelAvailability(createInitialModelAvailabilityState());
      return;
    }

    let cancelled = false;

    async function loadChatState() {
      setModelAvailability((current) => ({
        ...current,
        status: 'loading',
        message: null,
      }));

      try {
        const [models, runs] = await Promise.all([listChatModels(), listAgentRuns()]);
        if (cancelled) {
          return;
        }

        const chatRuns = runs.filter((run) => run.taskType === 'chat');
        const storedModelId =
          typeof window === 'undefined' ? null : window.localStorage.getItem(chatModelSelectionStorageKey);
        const nextModelId = reconcileSelectedModelId(models, storedModelId);

        setChatModels(models);
        setSelectedModelId(nextModelId);
        if (models.length === 0) {
          setRecentRuns([]);
          setSelectedRunId(null);
          setMessages([]);
          setModelAvailability((current) => ({
            ...current,
            status: 'maintenance',
            message: buildUnavailableModelMessage(),
          }));
          return;
        }

        setModelAvailability((current) => ({
          ...current,
          status: 'ready',
          message: null,
        }));

        setRecentRuns(chatRuns);
        const latestRunId = chatRuns[0]?.id ?? null;
        setSelectedRunId(latestRunId);
        if (!latestRunId) {
          setMessages([]);
          return;
        }

        const detail = await getAgentRunDetail(latestRunId);
        if (cancelled) {
          return;
        }
        const conversationRuns = getConversationRuns(chatRuns, detail.run.conversationId);
        setMessages(mapRunsToMessages(conversationRuns));
      } catch {
        if (cancelled) {
          return;
        }

        setRecentRuns([]);
        setChatModels([]);
        setSelectedModelId(null);
        setSelectedRunId(null);
        setMessages([]);
        setModelAvailability((current) => ({
          ...current,
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        }));
      }
    }

    void loadChatState();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user, modelAvailability.reloadKey]);

  useEffect(() => {
    if (isLoggedIn || !user) {
      return;
    }

    const timer = window.setTimeout(() => router.push('/home'), 0);
    return () => window.clearTimeout(timer);
  }, [isLoggedIn, router, user]);

  useEffect(() => {
    if (!streamRunId) {
      return;
    }

    const eventSource = new EventSource(createAgentRunEventsUrl(streamRunId));
    eventSource.addEventListener('assistant_delta', (event) => {
      const payload = parseStreamEventPayload(event);
      const delta = typeof payload?.payload?.delta === 'string' ? payload.payload.delta : '';
      if (!delta) {
        return;
      }

      setMessages((prev) => appendAssistantDelta(prev, streamRunId, delta));
    });
    eventSource.addEventListener('run_completed', async (event) => {
      const payload = parseStreamEventPayload(event);
      const finalMessage =
        typeof payload?.payload?.finalMessage === 'string' ? payload.payload.finalMessage : null;
      if (finalMessage) {
        setMessages((prev) => reconcileAssistantFinalMessage(prev, streamRunId, finalMessage));
      }
      const runs = await listAgentRuns();
      setRecentRuns(runs.filter((run) => run.taskType === 'chat'));
      eventSource.close();
      setStreamRunId((current) => (current === streamRunId ? null : current));
    });
    eventSource.addEventListener('run_failed', async (event) => {
      const payload = parseStreamEventPayload(event);
      const failureMessage =
        typeof payload?.payload?.message === 'string' ? payload.payload.message : 'AI 请求失败';
      setErrorMessage(failureMessage);
      setMessages((prev) => removeAssistantLoadingMessage(prev, streamRunId));
      const runs = await listAgentRuns();
      setRecentRuns(runs.filter((run) => run.taskType === 'chat'));
      eventSource.close();
      setStreamRunId((current) => (current === streamRunId ? null : current));
    });
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [streamRunId]);

  useEffect(() => {
    if (!selectedRunId || streamRunId === selectedRunId) {
      return;
    }

    const runId = selectedRunId;
    let cancelled = false;
    async function loadConversation() {
      try {
        const detail = await getAgentRunDetail(runId);
        const runs = await listAgentRuns();
        if (!cancelled) {
          const chatRuns = runs.filter((run) => run.taskType === 'chat');
          const conversationRuns = getConversationRuns(chatRuns, detail.run.conversationId);
          setRecentRuns(chatRuns);
          setMessages(mapRunsToMessages(conversationRuns));
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(readRuntimeErrorMessage(error, '对话加载失败'));
        }
      }
    }

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, streamRunId]);

  const selectedModel = chatModels.find((model) => model.id === selectedModelId) ?? null;
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
          : !selectedModelId
            ? buildUnavailableModelMessage()
            : null;

  const handleModelChange = (modelId: string) => {
    const nextModelId = reconcileSelectedModelId(chatModels, modelId);
    setSelectedModelId(nextModelId);
    if (nextModelId) {
      window.localStorage.setItem(chatModelSelectionStorageKey, nextModelId);
    } else {
      window.localStorage.removeItem(chatModelSelectionStorageKey);
    }
  };

  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleDeleteRun = async (runId: string) => {
    if (deletingRunId) {
      return;
    }
    if (!window.confirm('删除后这条历史记录将不再展示，确认删除吗？')) {
      return;
    }

    setDeletingRunId(runId);
    setErrorMessage(null);
    try {
      await deleteAgentRun(runId);
      setRecentRuns((prev) => prev.filter((run) => run.id !== runId));
      setExpandedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(`${runId}-assistant`);
        return next;
      });
      if (selectedRunId === runId) {
        const deletedRun = recentRuns.find((run) => run.id === runId);
        const nextConversationHead = getConversationHeads(
          recentRuns.filter((run) => run.conversationId !== deletedRun?.conversationId),
        )[0];
        setSelectedRunId(nextConversationHead?.id ?? null);
        setMessages(nextConversationHead ? mapRunsToMessages(getConversationRuns(recentRuns, nextConversationHead.conversationId)) : []);
      }
      if (streamRunId === runId) {
        setStreamRunId(null);
      }
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, '历史记录删除失败'));
    } finally {
      setDeletingRunId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (isSubmitting) return;
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    if (!selectedModelId) {
      setErrorMessage(
        modelAvailability.status === 'loading'
          ? '模型列表加载中'
          : buildUnavailableModelMessage(),
      );
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
      const currentConversationId = selectedRunId
        ? recentRuns.find((run) => run.id === selectedRunId)?.conversationId
        : undefined;
      const { run } = await createAgentRun({
        taskType: 'chat',
        prompt,
        modelId: selectedModelId,
        conversationId: currentConversationId,
      });
      if (run.status === 'failed') {
        setErrorMessage(run.errorMessage ?? 'AI 请求失败');
        return;
      }
      setSelectedRunId(run.id);
      setStreamRunId(run.id);
      const detail = await getAgentRunDetail(run.id);
      setRecentRuns((prev) => [detail.run, ...prev.filter((item) => item.id !== detail.run.id)]);
      setMessages((prev) => ensureAssistantLoadingMessage(mergeCreatedRunMessages(prev, detail), run.id));
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, 'AI 请求失败'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const conversations = getConversationHeads(recentRuns).map(mapRunToConversationSummary);

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
              onClick={() => {
                setSelectedRunId(null);
                setStreamRunId(null);
                setMessages([]);
              }}
              className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-black/8 px-3 py-2.5 text-sm text-[#555555] transition-colors hover:border-black/10 hover:text-[#1d1d1f]"
            >
              + 新对话
            </button>
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] ${
                  selectedRunId === c.id ? 'bg-white text-[#1d1d1f]' : 'text-[#1d1d1f]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedRunId(c.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="block text-[11px] text-[#999]">{c.time}</span>
                </button>
                <button
                  type="button"
                  aria-label="删除历史记录"
                  disabled={deletingRunId === c.id}
                  onClick={() => void handleDeleteRun(c.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#999999] opacity-0 transition hover:bg-black/5 hover:text-red-500 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
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
              {messages.map((msg) => {
                const isStreamingMessage = msg.role === 'assistant' && streamRunId !== null && msg.id === `${streamRunId}-assistant`;
                const isLongAssistantMessage =
                  msg.role === 'assistant' &&
                  !isStreamingMessage &&
                  msg.content.length > longAssistantMessageThreshold;
                const isExpanded = expandedMessageIds.has(msg.id);
                const shouldClip = isLongAssistantMessage && !isExpanded;

                return (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#1d1d1f] text-white'
                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                  }`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    ) : msg.isLoading ? (
                      <div className="flex items-center gap-1 py-1" aria-label="AI 正在思考">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6e6e73] [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6e6e73] [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6e6e73]" />
                      </div>
                    ) : (
                      <>
                        <div className={`break-words ${shouldClip ? 'max-h-72 overflow-hidden' : ''}`}>
                          <ChatMarkdown content={msg.content} />
                        </div>
                        {isLongAssistantMessage && (
                          <button
                            type="button"
                            onClick={() => toggleMessageExpansion(msg.id)}
                            className="mt-2 text-xs font-medium text-[#555555] transition-colors hover:text-[#1d1d1f]"
                          >
                            {isExpanded ? '收起' : '展开全文'}
                          </button>
                        )}
                      </>
                    )}
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
              );
              })}
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
                <option value="">
                  {!isLoggedIn
                    ? '登录后查看可用模型'
                    : modelLoading
                      ? '模型加载中'
                      : buildUnavailableModelMessage()}
                </option>
              ) : (
                chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.entitlementLabel} · {model.pricingSummary}
                  </option>
                ))
              )}
            </select>
            {!isLoggedIn ? (
              <p className="text-xs text-[#6e6e73]">登录后查看可用模型</p>
            ) : modelMaintenanceMessage ? (
              <div className="flex items-center gap-3">
                <p className="text-xs text-[#6e6e73]">{modelMaintenanceMessage}</p>
                <button
                  type="button"
                  onClick={() =>
                    setModelAvailability((current) => ({
                      ...current,
                      reloadKey: nextReloadKey(current.reloadKey),
                    }))
                  }
                  className="text-xs font-medium text-[#1d1d1f] transition-colors hover:text-[#555555]"
                >
                  重新加载模型
                </button>
              </div>
            ) : null}
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              disabled={isSubmitting || Boolean(submitDisabledReason)}
              className="flex-1 rounded-xl border border-black/8 bg-white/[0.03] px-4 py-2.5 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none transition-colors focus:border-black/10"
            />
            <button type="submit" disabled={isSubmitting || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary cursor-pointer rounded-xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} />
            </button>
          </form>
          {submitDisabledReason ? <p className="mt-2 text-xs text-[#6e6e73]">{submitDisabledReason}</p> : null}
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
              <div
                key={c.id}
                className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-[#1d1d1f]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRunId(c.id);
                    setMobileMenuOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate">{c.title}</span>
                  <span className="block text-[11px] text-[#6e6e73]">{c.time}</span>
                </button>
                <button
                  type="button"
                  aria-label="删除历史记录"
                  disabled={deletingRunId === c.id}
                  onClick={() => void handleDeleteRun(c.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#777777] hover:bg-black/5 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
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

function getConversationRuns(runs: AgentRunDto[], conversationId: string): AgentRunDto[] {
  return runs
    .filter((run) => run.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function getConversationHeads(runs: AgentRunDto[]): AgentRunDto[] {
  const byConversation = new Map<string, AgentRunDto>();
  for (const run of runs) {
    const current = byConversation.get(run.conversationId);
    if (!current || new Date(run.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      byConversation.set(run.conversationId, run);
    }
  }

  return Array.from(byConversation.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function mergeCreatedRunMessages(messages: Message[], detail: AgentRunDetailDto): Message[] {
  const runMessages = mapDetailToMessages(detail);
  const runUserMessage = runMessages.find((message) => message.id === `${detail.run.id}-user`);
  const normalized = runUserMessage
    ? messages.map((message) =>
        message.id.startsWith('msg-') &&
        message.role === 'user' &&
        message.content === runUserMessage.content
          ? { ...runUserMessage, timestamp: message.timestamp }
          : message,
      )
    : messages;
  const existingIds = new Set(normalized.map((message) => message.id));

  return [
    ...normalized,
    ...runMessages.filter((message) => !existingIds.has(message.id)),
  ].sort((a, b) => a.timestamp - b.timestamp);
}

function mapDetailToMessages(detail: AgentRunDetailDto): Message[] {
  const created = new Date(detail.run.createdAt).getTime();
  const messages: Message[] = [
    {
      id: `${detail.run.id}-user`,
      role: 'user',
      content: detail.run.prompt,
      timestamp: created,
    },
  ];

  const assistantText = detail.events.reduce((text, event) => {
    if (event.eventType === 'assistant_delta' && typeof event.payload.delta === 'string') {
      return text + event.payload.delta;
    }
    if (event.eventType === 'run_completed' && typeof event.payload.finalMessage === 'string') {
      return event.payload.finalMessage;
    }
    return text;
  }, '');

  if (assistantText) {
    messages.push({
      id: `${detail.run.id}-assistant`,
      role: 'assistant',
      content: assistantText,
      modelLabel: formatModelLabel(detail.run),
      billingLabel: formatBillingLabel(detail.run),
      usageLabel: formatUsageLabel(detail.run),
      timestamp: new Date(detail.run.updatedAt).getTime(),
    });
  }

  return messages;
}

function appendAssistantDelta(messages: Message[], runId: string, delta: string): Message[] {
  const next = [...messages];
  const assistantId = `${runId}-assistant`;
  const existingIndex = next.findIndex((message) => message.id === assistantId);
  if (existingIndex >= 0) {
    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      content: existing.isLoading ? delta : `${existing.content}${delta}`,
      isLoading: false,
    };
    return next;
  }

  next.push({
    id: assistantId,
    role: 'assistant',
    content: delta,
    timestamp: Date.now(),
  });
  return next;
}

function ensureAssistantLoadingMessage(messages: Message[], runId: string): Message[] {
  const assistantId = `${runId}-assistant`;
  if (messages.some((message) => message.id === assistantId)) {
    return messages;
  }

  return [
    ...messages,
    {
      id: assistantId,
      role: 'assistant',
      content: '',
      isLoading: true,
      timestamp: Date.now(),
    },
  ];
}

function removeAssistantLoadingMessage(messages: Message[], runId: string): Message[] {
  const assistantId = `${runId}-assistant`;
  return messages.filter((message) => message.id !== assistantId || !message.isLoading);
}

function reconcileAssistantFinalMessage(messages: Message[], runId: string, content: string): Message[] {
  const assistantId = `${runId}-assistant`;
  const existing = messages.find((message) => message.id === assistantId);
  if (!existing) {
    return appendAssistantDelta(messages, runId, content);
  }

  if (!existing.isLoading && (existing.content === content || existing.content.startsWith(content))) {
    return messages;
  }

  return messages.map((message) =>
    message.id === assistantId ? { ...message, content, isLoading: false } : message,
  );
}

function parseStreamEventPayload(event: Event) {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
    return null;
  }

  try {
    return JSON.parse(event.data) as {
      payload?: Record<string, unknown>;
    };
  } catch {
    return null;
  }
}

function formatModelLabel(run: AgentRunDto) {
  const modelName = run.selectedModel?.name ?? run.capabilitySummary.model;
  return formatChatModelLabel(modelName);
}

function formatBillingLabel(run: AgentRunDto) {
  if (!run.billing) {
    return undefined;
  }

  if (typeof run.billing.creditCost === 'number') {
    return `消耗：${formatCredits(run.billing.creditCost)} 积分`;
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
    conversationId: run.conversationId,
    title: run.prompt.length > 18 ? `${run.prompt.slice(0, 18)}...` : run.prompt,
    time: new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(run.createdAt)),
  };
}
