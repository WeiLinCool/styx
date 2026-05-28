'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Send, Bot, Copy, RotateCcw, Menu, X, User, MessageSquare, Lightbulb, Code, PenTool, Globe, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const quickPrompts = [
  { icon: Lightbulb, text: '帮我设计一个石头印画作品' },
  { icon: Code, text: '写一段AI视频生成提示词' },
  { icon: PenTool, text: '生成石头印画分镜脚本' },
  { icon: Globe, text: '如何用AI做短视频获客？' },
];

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (!isLoggedIn) { openLoginModal(); return; }

    const now = Date.now();
    msgCounter.current += 1;
    const userMsg: Message = {
      id: `msg-${now}-${msgCounter.current}`,
      role: 'user',
      content: input.trim(),
      timestamp: now,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // 模拟AI回复
    setTimeout(() => {
      msgCounter.current += 1;
      const aiMsg: Message = {
        id: `msg-${Date.now()}-${msgCounter.current}`,
        role: 'assistant',
        content: '您好！我是南风AI助手，专注于石头印画创作和AI视频工作流。请问有什么可以帮助您的？',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1200);
  };

  const conversations = [
    { id: '1', title: '石头印画设计方案', time: '刚刚' },
    { id: '2', title: 'AI视频提示词优化', time: '1小时前' },
    { id: '3', title: '分镜脚本生成', time: '昨天' },
  ];

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
              <div key={c.id} className="mb-1 cursor-pointer rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] transition-colors hover:bg-black/5">
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
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/5 bg-white/[0.02] px-4 py-3 text-left text-sm text-[#d1d1d6] transition-colors hover:border-black/8 hover:bg-white/[0.04]"
                  >
                    <qp.icon size={16} className="shrink-0 text-[#444444]" />
                    {qp.text}
                  </button>
                ))}
              </div>
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
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-black/5 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              className="flex-1 rounded-xl border border-black/8 bg-white/[0.03] px-4 py-2.5 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none transition-colors focus:border-black/10"
            />
            <button type="submit" className="apple-btn apple-btn-primary cursor-pointer rounded-xl px-4 py-2.5 text-sm">
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
              <div key={c.id} className="mb-1 cursor-pointer rounded-xl px-3 py-2 text-[13px] text-[#d1d1d6] hover:bg-black/5">
                <div className="truncate">{c.title}</div>
                <div className="text-[11px] text-[#444444]">{c.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
