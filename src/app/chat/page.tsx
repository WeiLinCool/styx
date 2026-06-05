'use client';

import { useState, useRef, useEffect, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Send, Bot, Menu, X, Lightbulb, Code, PenTool, Globe, ArrowLeft, Trash2, Folder, Pencil, Check, Plus, GripVertical,
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
  createConversationFolder,
  deleteAgentRun,
  deleteConversationFolder,
  getAgentRunDetail,
  listAgentConversations,
  listAgentRuns,
  listChatModels,
  selectChatModelId,
  updateAgentConversation,
  updateConversationFolder,
  type ChatModelOption,
} from '@/features/public/agent-runtime-client';
import { ChatMarkdown } from '@/features/public/chat-markdown';
import { formatChatModelLabel, formatChatUsageLabel } from '@/features/public/chat-message-format';
import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  nextReloadKey,
  reconcileSelectedModelId,
} from '@/features/public/model-availability';
import type {
  AgentConversationDto,
  AgentConversationFolderDto,
  AgentRunDetailDto,
  AgentRunDto,
} from '@/server/agent/types';

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
  folderId: string | null;
  title: string;
  time: string;
};

type ConversationDropTarget = 'uncategorized' | string | null;

const uncategorizedMoveValue = '__uncategorized__';

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
  const [conversationFolders, setConversationFolders] = useState<AgentConversationFolderDto[]>([]);
  const [conversationHistory, setConversationHistory] = useState<AgentConversationDto[]>([]);
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
  const [mutatingHistoryId, setMutatingHistoryId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingFolderName, setCreatingFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState('');
  const [movingConversationId, setMovingConversationId] = useState<string | null>(null);
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<ConversationDropTarget>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  async function refreshConversationHistory() {
    const history = await listAgentConversations();
    setConversationFolders(history.folders);
    setConversationHistory(history.conversations);
    return history;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setRecentRuns([]);
      setConversationFolders([]);
      setConversationHistory([]);
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
        const [models, runs, history] = await Promise.all([
          listChatModels(),
          listAgentRuns(),
          listAgentConversations(),
        ]);
        if (cancelled) {
          return;
        }

        const chatRuns = runs.filter((run) => run.taskType === 'chat');
        const storedModelId =
          typeof window === 'undefined' ? null : window.localStorage.getItem(chatModelSelectionStorageKey);
        const nextModelId = reconcileSelectedModelId(models, storedModelId);

        setChatModels(models);
        setConversationFolders(history.folders);
        setConversationHistory(history.conversations);
        setSelectedModelId(nextModelId);
        if (models.length === 0) {
          setRecentRuns([]);
          setConversationFolders([]);
          setConversationHistory([]);
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
      const [detail, runs] = await Promise.all([
        getAgentRunDetail(streamRunId),
        listAgentRuns(),
      ]);
      setMessages((prev) => reconcileAssistantRunMetadata(prev, detail.run));
      setRecentRuns(runs.filter((run) => run.taskType === 'chat'));
      await refreshConversationHistory();
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
      await refreshConversationHistory();
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

  const handleCreateFolder = async (event?: FormEvent) => {
    event?.preventDefault();
    const name = creatingFolderName.trim();
    if (!name) {
      return;
    }
    setMutatingHistoryId('folder:new');
    setErrorMessage(null);
    try {
      await createConversationFolder(name);
      setCreatingFolderName('');
      setIsCreatingFolder(false);
      await refreshConversationHistory();
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, '文件夹创建失败'));
    } finally {
      setMutatingHistoryId(null);
    }
  };

  const startRenameFolder = (folder: AgentConversationFolderDto) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setMovingConversationId(null);
  };

  const cancelRenameFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const handleRenameFolder = async (folder: AgentConversationFolderDto, event?: FormEvent) => {
    event?.preventDefault();
    const name = editingFolderName.trim();
    if (!name) {
      return;
    }
    if (name === folder.name) {
      cancelRenameFolder();
      return;
    }
    setMutatingHistoryId(folder.id);
    setErrorMessage(null);
    try {
      await updateConversationFolder(folder.id, name);
      cancelRenameFolder();
      await refreshConversationHistory();
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, '文件夹重命名失败'));
    } finally {
      setMutatingHistoryId(null);
    }
  };

  const handleDeleteFolder = async (folder: AgentConversationFolderDto) => {
    if (!window.confirm('删除文件夹后，对话会回到未分类，确认删除吗？')) {
      return;
    }
    setMutatingHistoryId(folder.id);
    setErrorMessage(null);
    try {
      await deleteConversationFolder(folder.id);
      await refreshConversationHistory();
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, '文件夹删除失败'));
    } finally {
      setMutatingHistoryId(null);
    }
  };

  const startRenameConversation = (conversation: ConversationSummary) => {
    setEditingConversationId(conversation.conversationId);
    setEditingConversationTitle(conversation.title);
    setMovingConversationId(null);
  };

  const cancelRenameConversation = () => {
    setEditingConversationId(null);
    setEditingConversationTitle('');
  };

  const handleRenameConversation = async (conversation: ConversationSummary, event?: FormEvent) => {
    event?.preventDefault();
    const title = editingConversationTitle.trim();
    if (title === conversation.title) {
      cancelRenameConversation();
      return;
    }
    setMutatingHistoryId(conversation.conversationId);
    setErrorMessage(null);
    try {
      await updateAgentConversation(conversation.conversationId, {
        titleOverride: title ? title : null,
      });
      cancelRenameConversation();
      await refreshConversationHistory();
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, '对话重命名失败'));
    } finally {
      setMutatingHistoryId(null);
    }
  };

  const handleMoveConversation = async (conversation: ConversationSummary, folderId: string | null) => {
    if (conversation.folderId === folderId) {
      setMovingConversationId(null);
      return;
    }
    setMutatingHistoryId(conversation.conversationId);
    setErrorMessage(null);
    try {
      await updateAgentConversation(conversation.conversationId, { folderId });
      setMovingConversationId(null);
      await refreshConversationHistory();
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, '对话移动失败'));
    } finally {
      setMutatingHistoryId(null);
    }
  };

  const handleDropConversation = async (event: DragEvent, folderId: string | null) => {
    event.preventDefault();
    const conversationId = event.dataTransfer.getData('text/plain') || draggingConversationId;
    setActiveDropTarget(null);
    setDraggingConversationId(null);
    if (!conversationId) {
      return;
    }
    const conversation = conversations.find((item) => item.conversationId === conversationId);
    if (!conversation) {
      return;
    }
    await handleMoveConversation(conversation, folderId);
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
      await refreshConversationHistory();
      setMessages((prev) => ensureAssistantLoadingMessage(mergeCreatedRunMessages(prev, detail), run.id));
    } catch (error) {
      setErrorMessage(readRuntimeErrorMessage(error, 'AI 请求失败'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const conversations = conversationHistory.length > 0
    ? conversationHistory
        .map((conversation) => mapConversationToSummary(conversation, recentRuns))
        .filter((conversation): conversation is ConversationSummary => conversation !== null)
    : getConversationHeads(recentRuns).map(mapRunToConversationSummary);
  const uncategorizedConversations = conversations.filter((conversation) => conversation.folderId === null);
  const conversationsByFolder = new Map<string, ConversationSummary[]>();
  for (const conversation of conversations) {
    if (!conversation.folderId) {
      continue;
    }
    const items = conversationsByFolder.get(conversation.folderId) ?? [];
    items.push(conversation);
    conversationsByFolder.set(conversation.folderId, items);
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* 侧边栏 - 桌面 */}
      {sidebarOpen && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-secondary/60 md:flex">
          <div className="flex items-center justify-between border-b border-border p-4">
            <Link href="/home" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-card shadow-sm">
                <svg width="12" height="12" viewBox="0 0 40 40" fill="none"><path d="M20 4L8 12V28L20 36L32 28V12L20 4Z" fill="black" /><circle cx="20" cy="20" r="4" fill="white" /></svg>
              </div>
              <span className="text-sm font-semibold">AI对话</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <button
              onClick={() => {
                setSelectedRunId(null);
                setStreamRunId(null);
                setMessages([]);
              }}
              className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-background/80 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              + 新对话
            </button>
            <div className="mb-3">
              {isCreatingFolder ? (
                <form onSubmit={(event) => void handleCreateFolder(event)} className="flex items-center gap-1 rounded-xl border border-ring bg-card p-1.5">
                  <Folder size={15} className="ml-1 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={creatingFolderName}
                    onChange={(event) => setCreatingFolderName(event.target.value)}
                    placeholder="文件夹名称"
                    disabled={mutatingHistoryId === 'folder:new'}
                    className="min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    aria-label="创建文件夹"
                    disabled={mutatingHistoryId === 'folder:new' || !creatingFolderName.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="取消创建文件夹"
                    onClick={() => {
                      setIsCreatingFolder(false);
                      setCreatingFolderName('');
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(true)}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  <Plus size={15} />
                  新建文件夹
                </button>
              )}
            </div>
            <ConversationGroup
              title="未分类"
              conversations={uncategorizedConversations}
              folderId={null}
              folders={conversationFolders}
              selectedRunId={selectedRunId}
              deletingRunId={deletingRunId}
              mutatingHistoryId={mutatingHistoryId}
              draggingConversationId={draggingConversationId}
              activeDropTarget={activeDropTarget}
              editingConversationId={editingConversationId}
              editingConversationTitle={editingConversationTitle}
              movingConversationId={movingConversationId}
              onSelect={setSelectedRunId}
              onStartRename={startRenameConversation}
              onCancelRename={cancelRenameConversation}
              onRename={(conversation, event) => void handleRenameConversation(conversation, event)}
              onEditingConversationTitleChange={setEditingConversationTitle}
              onStartMove={(conversation) => {
                setMovingConversationId((current) => current === conversation.conversationId ? null : conversation.conversationId);
                setEditingConversationId(null);
              }}
              onMove={(conversation, folderId) => void handleMoveConversation(conversation, folderId)}
              onCancelMove={() => setMovingConversationId(null)}
              onDelete={handleDeleteRun}
              onDragStart={(conversationId) => setDraggingConversationId(conversationId)}
              onDragEnd={() => {
                setDraggingConversationId(null);
                setActiveDropTarget(null);
              }}
              onDragEnter={() => setActiveDropTarget('uncategorized')}
              onDrop={(event) => void handleDropConversation(event, null)}
            />
            {conversationFolders.map((folder) => (
              <div
                key={folder.id}
                className={`mt-3 rounded-xl transition-colors ${
                  activeDropTarget === folder.id ? 'bg-card/80 ring-1 ring-ring' : ''
                }`}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => setActiveDropTarget(folder.id)}
                onDrop={(event) => void handleDropConversation(event, folder.id)}
              >
                {editingFolderId === folder.id ? (
                  <form onSubmit={(event) => void handleRenameFolder(folder, event)} className="mb-1 flex items-center gap-1 rounded-lg border border-ring bg-card p-1.5">
                    <Folder size={13} className="ml-1 shrink-0 text-muted-foreground" />
                    <input
                      autoFocus
                      value={editingFolderName}
                      onChange={(event) => setEditingFolderName(event.target.value)}
                      disabled={mutatingHistoryId === folder.id}
                      className="min-w-0 flex-1 bg-transparent px-1 text-xs font-medium text-foreground outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="保存文件夹名称"
                      disabled={mutatingHistoryId === folder.id || !editingFolderName.trim()}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="取消重命名文件夹"
                      onClick={cancelRenameFolder}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X size={12} />
                    </button>
                  </form>
                ) : (
                  <div className="mb-1 flex items-center gap-1 px-2 text-[11px] font-medium uppercase text-muted-foreground">
                    <Folder size={13} />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <button
                      type="button"
                      aria-label="重命名文件夹"
                      disabled={mutatingHistoryId === folder.id}
                      onClick={() => startRenameFolder(folder)}
                      className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="删除文件夹"
                      disabled={mutatingHistoryId === folder.id}
                      onClick={() => void handleDeleteFolder(folder)}
                      className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
                <ConversationGroup
                  title={folder.name}
                  hideTitle
                  conversations={conversationsByFolder.get(folder.id) ?? []}
                  folderId={folder.id}
                  folders={conversationFolders}
                  selectedRunId={selectedRunId}
                  deletingRunId={deletingRunId}
                  mutatingHistoryId={mutatingHistoryId}
                  draggingConversationId={draggingConversationId}
                  activeDropTarget={activeDropTarget}
                  editingConversationId={editingConversationId}
                  editingConversationTitle={editingConversationTitle}
                  movingConversationId={movingConversationId}
                  onSelect={setSelectedRunId}
                  onStartRename={startRenameConversation}
                  onCancelRename={cancelRenameConversation}
                  onRename={(conversation, event) => void handleRenameConversation(conversation, event)}
                  onEditingConversationTitleChange={setEditingConversationTitle}
                  onStartMove={(conversation) => {
                    setMovingConversationId((current) => current === conversation.conversationId ? null : conversation.conversationId);
                    setEditingConversationId(null);
                  }}
                  onMove={(conversation, folderId) => void handleMoveConversation(conversation, folderId)}
                  onCancelMove={() => setMovingConversationId(null)}
                  onDelete={handleDeleteRun}
                  onDragStart={(conversationId) => setDraggingConversationId(conversationId)}
                  onDragEnd={() => {
                    setDraggingConversationId(null);
                    setActiveDropTarget(null);
                  }}
                  onDragEnter={() => setActiveDropTarget(folder.id)}
                  onDrop={(event) => void handleDropConversation(event, folder.id)}
                />
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* 主区域 */}
      <div className="flex flex-1 flex-col">
        {/* 顶栏 */}
        <header className="flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link href="/home" className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft size={16} />
              <span className="text-xs">返回</span>
            </Link>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"><Menu size={18} /></button>
            )}
            <span className="text-sm font-medium">AI对话</span>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn && user ? (
              <div className="flex items-center gap-2">
                <UserAvatar avatar={user.avatar} size={24} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                <span className="text-xs text-muted-foreground">{user.nickname}</span>
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
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                    <Bot size={24} />
                  </div>
                  <h2 className="mb-2 text-lg font-semibold text-foreground">开始对话</h2>
                  <p className="mb-8 text-sm text-muted-foreground">向AI助手提问石头印画创作和AI视频工作流</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickPrompts.map((qp) => (
                      <button
                        key={qp.text}
                        onClick={() => { setInput(qp.text); }}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-secondary/70 hover:text-foreground"
                      >
                        <qp.icon size={16} className="shrink-0" />
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
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    ) : msg.isLoading ? (
                      <div className="flex items-center gap-1 py-1" aria-label="AI 正在思考">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
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
                            className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                          : 'border-border text-muted-foreground'
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
        <div className="border-t border-border bg-background/95 p-4 backdrop-blur-xl">
          {errorMessage && (
            <p className="mb-2 text-sm text-destructive">{errorMessage}</p>
          )}
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="sr-only" htmlFor="chat-model-selector">聊天模型</label>
            <select
              id="chat-model-selector"
              value={selectedModelId ?? ''}
              onChange={(event) => handleModelChange(event.target.value)}
              disabled={modelLoading || chatModels.length === 0 || isSubmitting}
              className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-ring disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground sm:w-[360px]"
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
              <p className="text-xs text-muted-foreground">登录后查看可用模型</p>
            ) : modelMaintenanceMessage ? (
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">{modelMaintenanceMessage}</p>
                <button
                  type="button"
                  onClick={() =>
                    setModelAvailability((current) => ({
                      ...current,
                      reloadKey: nextReloadKey(current.reloadKey),
                    }))
                  }
                  className="text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
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
              className="flex-1 rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring"
            />
            <button type="submit" disabled={isSubmitting || Boolean(submitDisabledReason)} className="apple-btn apple-btn-primary cursor-pointer rounded-xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} />
            </button>
          </form>
          {submitDisabledReason ? <p className="mt-2 text-xs text-muted-foreground">{submitDisabledReason}</p> : null}
        </div>
      </div>

      {/* 移动端菜单 */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-64 bg-secondary p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">对话列表</span>
              <button onClick={() => setMobileMenuOpen(false)} className="cursor-pointer text-muted-foreground"><X size={18} /></button>
            </div>
            {conversations.map((c) => (
              <div
                key={c.id}
                className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-foreground"
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
                  <span className="block text-[11px] text-muted-foreground">{c.time}</span>
                </button>
                <button
                  type="button"
                  aria-label="删除历史记录"
                  disabled={deletingRunId === c.id}
                  onClick={() => void handleDeleteRun(c.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
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

function ConversationGroup({
  title,
  hideTitle = false,
  conversations,
  folderId,
  folders,
  selectedRunId,
  deletingRunId,
  mutatingHistoryId,
  draggingConversationId,
  activeDropTarget,
  editingConversationId,
  editingConversationTitle,
  movingConversationId,
  onSelect,
  onStartRename,
  onCancelRename,
  onRename,
  onEditingConversationTitleChange,
  onStartMove,
  onMove,
  onCancelMove,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: {
  title: string;
  hideTitle?: boolean;
  conversations: ConversationSummary[];
  folderId: string | null;
  folders: AgentConversationFolderDto[];
  selectedRunId: string | null;
  deletingRunId: string | null;
  mutatingHistoryId: string | null;
  draggingConversationId: string | null;
  activeDropTarget: ConversationDropTarget;
  editingConversationId: string | null;
  editingConversationTitle: string;
  movingConversationId: string | null;
  onSelect: (runId: string) => void;
  onStartRename: (conversation: ConversationSummary) => void;
  onCancelRename: () => void;
  onRename: (conversation: ConversationSummary, event?: FormEvent) => void;
  onEditingConversationTitleChange: (title: string) => void;
  onStartMove: (conversation: ConversationSummary) => void;
  onMove: (conversation: ConversationSummary, folderId: string | null) => void;
  onCancelMove: () => void;
  onDelete: (runId: string) => void;
  onDragStart: (conversationId: string) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: (event: DragEvent) => void;
}) {
  const dropTarget = folderId ?? 'uncategorized';
  const isActiveDropTarget = activeDropTarget === dropTarget;

  if (conversations.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed px-3 py-3 text-[11px] transition-colors ${
          isActiveDropTarget
            ? 'border-ring bg-card text-foreground'
            : 'border-border/70 text-muted-foreground'
        }`}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={onDragEnter}
        onDrop={onDrop}
      >
        {hideTitle ? '拖到这里归类' : `${title}暂无对话，拖到这里归类`}
      </div>
    );
  }

  return (
    <div
      className={`space-y-1 rounded-xl transition-colors ${
        isActiveDropTarget ? 'bg-card/80 ring-1 ring-ring' : ''
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
    >
      {!hideTitle && (
        <div className="px-2 pb-1 text-[11px] font-medium uppercase text-muted-foreground">
          {title}
        </div>
      )}
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          draggable={editingConversationId !== conversation.conversationId && movingConversationId !== conversation.conversationId}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', conversation.conversationId);
            onDragStart(conversation.conversationId);
          }}
          onDragEnd={onDragEnd}
          className={`group rounded-xl px-2 py-2 text-left text-[13px] transition ${
            selectedRunId === conversation.id ? 'bg-card text-foreground shadow-sm' : 'text-foreground'
          } ${
            draggingConversationId === conversation.conversationId ? 'opacity-50' : ''
          }`}
        >
          {editingConversationId === conversation.conversationId ? (
            <form onSubmit={(event) => onRename(conversation, event)} className="flex items-center gap-1">
              <input
                autoFocus
                value={editingConversationTitle}
                onChange={(event) => onEditingConversationTitleChange(event.target.value)}
                disabled={mutatingHistoryId === conversation.conversationId}
                className="min-w-0 flex-1 rounded-lg border border-ring bg-background px-2 py-1.5 text-sm text-foreground outline-none"
              />
              <button
                type="submit"
                aria-label="保存对话名称"
                disabled={mutatingHistoryId === conversation.conversationId}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                aria-label="取消重命名对话"
                onClick={onCancelRename}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={13} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <GripVertical size={13} className="shrink-0 text-muted-foreground opacity-40 transition group-hover:opacity-80" />
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate font-medium">{conversation.title}</span>
                <span className="block text-[11px] text-muted-foreground">{conversation.time}</span>
              </button>
              <button
                type="button"
                aria-label="重命名对话"
                onClick={() => onStartRename(conversation)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-card hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                aria-label="移动对话"
                onClick={() => onStartMove(conversation)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-card hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                <Folder size={13} />
              </button>
              <button
                type="button"
                aria-label="删除历史记录"
                disabled={deletingRunId === conversation.id}
                onClick={() => void onDelete(conversation.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
          {movingConversationId === conversation.conversationId && (
            <div className="mt-2 flex items-center gap-1 pl-5">
              <select
                autoFocus
                value={conversation.folderId ?? uncategorizedMoveValue}
                disabled={mutatingHistoryId === conversation.conversationId}
                onChange={(event) => {
                  const nextFolderId = event.target.value === uncategorizedMoveValue ? null : event.target.value;
                  onMove(conversation, nextFolderId);
                }}
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value={uncategorizedMoveValue}>未分类</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="关闭移动菜单"
                onClick={onCancelMove}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
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

function reconcileAssistantRunMetadata(messages: Message[], run: AgentRunDto): Message[] {
  const assistantId = `${run.id}-assistant`;
  return messages.map((message) =>
    message.id === assistantId
      ? {
          ...message,
          modelLabel: formatModelLabel(run),
          billingLabel: formatBillingLabel(run),
          usageLabel: formatUsageLabel(run),
        }
      : message,
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
  return formatChatUsageLabel(run.usage);
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
    folderId: null,
    title: run.prompt.length > 18 ? `${run.prompt.slice(0, 18)}...` : run.prompt,
    time: new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(run.createdAt)),
  };
}

function mapConversationToSummary(
  conversation: AgentConversationDto,
  runs: AgentRunDto[],
): ConversationSummary | null {
  const run = runs
    .filter((item) => item.conversationId === conversation.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    conversationId: conversation.id,
    folderId: conversation.folderId,
    title: conversation.title,
    time: new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(conversation.lastRunAt)),
  };
}
