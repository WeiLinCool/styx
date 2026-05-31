'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  productValueProps,
  publicAiToolLinks,
  publicExploreLinks,
  publicNavLinks,
  publicToolCards,
} from '@/features/public/home-data';
import {
  User, Menu, X, ArrowRight, Camera, Check, Hammer, Truck, Star,
  ChevronDown, ChevronRight, ImageIcon, Video, Workflow,
} from 'lucide-react';

/* ── 滚动渐现 ── */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.unobserve(el); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`transition-all duration-700 ${vis ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'} ${className ?? ''}`}>{children}</div>;
}

/* ── 导航栏 ── */
function Navbar({ onLoginClick }: { onLoginClick: () => void }) {
  const router = useRouter();
  const { user, isLoggedIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const links = publicNavLinks;

  return (
    <nav className={`fixed top-3 right-0 left-0 z-50 px-4 transition-all duration-500 ${scrolled ? 'opacity-100' : 'opacity-100'}`}>
      <div className={`mx-auto flex h-12 max-w-5xl items-center justify-between rounded-2xl px-5 transition-all duration-500 ${scrolled ? 'bg-white/70 shadow-lg shadow-black/[0.04] backdrop-blur-2xl border border-black/[0.06]' : 'bg-white/50 shadow-md shadow-black/[0.02] backdrop-blur-2xl border border-black/[0.06]'}`}>
        <Link href="/home" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1d1d1f] text-[10px] font-black tracking-tight text-white">NF</div>
          <span className="text-sm font-semibold tracking-tight text-[#1d1d1f]">南风石印工坊</span>
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          <Link href="/home" className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition-all hover:bg-black/[0.04] hover:backdrop-blur-md">
            首页
          </Link>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition-all hover:bg-black/[0.04] hover:backdrop-blur-md">
              {l.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] outline-none transition-all hover:bg-black/[0.04] hover:backdrop-blur-md data-[state=open]:bg-black/[0.04]">
              探索
              <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 rounded-xl border-black/[0.06] bg-white/95 p-1.5 shadow-xl backdrop-blur-2xl">
              {publicExploreLinks.map((l) => (
                <DropdownMenuItem key={l.href} asChild className="cursor-pointer rounded-lg px-3 py-2 text-[#1d1d1f] focus:bg-black/[0.04]">
                  <Link href={l.href} className="flex flex-col items-start">
                    <span className="text-[13px] font-medium">{l.label}</span>
                    <span className="text-[11px] text-[#86868b]">{l.desc}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] outline-none transition-all hover:bg-black/[0.04] hover:backdrop-blur-md data-[state=open]:bg-black/[0.04]">
              AI工具
              <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 rounded-xl border-black/[0.06] bg-white/95 p-1.5 shadow-xl backdrop-blur-2xl">
              {publicAiToolLinks.map((l) => (
                <DropdownMenuItem key={l.href} asChild className="cursor-pointer rounded-lg px-3 py-2 text-[#1d1d1f] focus:bg-black/[0.04]">
                  <Link href={l.href} className="flex flex-col items-start">
                    <span className="text-[13px] font-medium">{l.label}</span>
                    <span className="text-[11px] text-[#86868b]">{l.desc}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <UserAvatar avatar={user.avatar} size={32} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                <span className="text-[13px] text-[#1d1d1f] font-medium">{user.nickname}</span>
              </div>
              <button onClick={logout} className="cursor-pointer text-xs text-[#86868b] hover:text-[#1d1d1f]">退出</button>
            </div>
          ) : (
            <button onClick={onLoginClick} className="cursor-pointer rounded-full bg-[#1d1d1f] px-5 py-1.5 text-[13px] font-medium text-white transition-all hover:bg-[#333]">
              登录
            </button>
          )}
        </div>

        <button onClick={() => setOpen(!open)} className="cursor-pointer text-[#1d1d1f] lg:hidden">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="mx-4 mt-2 overflow-hidden rounded-2xl border border-black/[0.06] bg-white/80 shadow-xl backdrop-blur-2xl lg:hidden">
          <div className="flex flex-col gap-0.5 p-4">
            <Link href="/home" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[13px] text-[#1d1d1f] hover:bg-black/[0.04]">
              首页
            </Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[13px] text-[#1d1d1f] hover:bg-black/[0.04]">
                {l.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-black/[0.06]" />
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              探索
            </div>
            {publicExploreLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-5 py-2 text-[13px] text-[#1d1d1f] hover:bg-black/[0.04]">
                {l.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-black/[0.06]" />
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              AI工具
            </div>
            {publicAiToolLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-5 py-2 text-[13px] text-[#1d1d1f] hover:bg-black/[0.04]">
                {l.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-black/[0.06]" />
            {isLoggedIn && user ? (
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => { setOpen(false); router.push('/user-center'); }} />
                  <span className="text-[13px] text-[#1d1d1f] font-medium">{user.nickname}</span>
                </div>
                <button onClick={logout} className="cursor-pointer text-xs text-[#86868b]">退出</button>
              </div>
            ) : (
              <button onClick={() => { onLoginClick(); setOpen(false); }} className="mt-1 cursor-pointer rounded-full bg-[#1d1d1f] px-5 py-2.5 text-[13px] font-medium text-white">
                登录 / 注册
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

/* ── Hero ── */
function HeroSection({ onStartCreate }: { onStartCreate: () => void }) {
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [floatingShapes, setFloatingShapes] = useState<{left: number; top: number; size: number; delay: number; duration: number}[]>([]);

  useEffect(() => {
    setHeroLoaded(true);
    setFloatingShapes(Array.from({ length: 6 }, (_, i) => ({
      left: 5 + i * 16 + Math.random() * 8,
      top: 10 + Math.random() * 80,
      size: 40 + Math.random() * 60,
      delay: i * 2,
      duration: 10 + Math.random() * 8,
    })));
  }, []);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 60%)', animation: 'haloExpand 8s ease-in-out infinite' }} />
        <div className="absolute left-1/2 top-1/2 h-[200px] w-[1px] -translate-x-1/2 -translate-y-1/2" style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.06), transparent)' }} />
      </div>

      {/* 浮动装饰 */}
      {floatingShapes.map((s, i) => (
        <div key={i} className="pointer-events-none absolute rounded-full border border-black/[0.03]"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.size}px`, height: `${s.size}px`, animation: `floatSlow ${s.duration}s ${s.delay}s ease-in-out infinite` }} />
      ))}

      <div className="relative z-10 mx-auto max-w-4xl px-5 py-20 text-center">
        <p className={`mb-6 text-sm font-medium tracking-widest text-[#444444] uppercase transition-all duration-700 delay-100 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          AI赋能 · 轻创业 · 石头印画
        </p>
        <h1 className={`mb-6 text-6xl font-black tracking-tight text-[#1d1d1f] sm:text-7xl lg:text-8xl transition-all duration-700 delay-200 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`} style={{ lineHeight: 1.05 }}>
          南风石印工坊
        </h1>
        <p className={`mx-auto mb-4 max-w-2xl text-xl font-medium text-[#1d1d1f] sm:text-2xl transition-all duration-700 delay-300 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          把照片印进一块石头里
        </p>
        <p className={`mx-auto mb-10 max-w-xl text-base text-[#555555] transition-all duration-700 delay-[400ms] ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          AI视频工作流驱动短视频获客，手工转印工艺打造独一无二石头印画。<br className="hidden sm:block" />
          轻资产创业，一人公司模式，普通人也能年入30万+。
        </p>
        <div className={`flex flex-col items-center gap-3 sm:flex-row sm:justify-center transition-all duration-700 delay-500 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <button onClick={onStartCreate} className="group flex items-center gap-2 rounded-full bg-[#1d1d1f] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/15 transition-all hover:bg-[#333] hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
            开始创作 <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link href="/shop" className="flex items-center gap-2 rounded-full border-2 border-[#1d1d1f] px-8 py-3.5 text-sm font-semibold text-[#1d1d1f] transition-all hover:bg-[#1d1d1f] hover:text-white hover:scale-[1.02] active:scale-[0.98]">
            浏览商城
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── 石印介绍 ── */
function StoneIntroSection() {
  const categories = [
    { image: '/pet.png', title: '宠物照片', desc: '猫咪、狗狗，桌面纪念摆件' },
    { image: '/couple.png', title: '情侣照片', desc: '纪念日、七夕、情人节礼物' },
    { image: '/family.png', title: '家人照片', desc: '宝宝照、全家福，温暖纪念' },
    { image: '/landscape.png', title: '风景照片', desc: '旅行照片、城市记忆' },
    { image: '/memorial.png', title: '纪念图片', desc: '重要的人，重要的时刻' },
  ];

  const process = [
    { step: '01', icon: Camera, title: '发送照片', desc: '发送你想定制的照片' },
    { step: '02', icon: Check, title: '确认效果', desc: '确认是否适合制作' },
    { step: '03', icon: Hammer, title: '手工制作', desc: '手工转印到石头上' },
    { step: '04', icon: Star, title: '成品确认', desc: '展示成品效果' },
    { step: '05', icon: Truck, title: '包装发出', desc: '搭配木架、礼盒发出' },
  ];

  const features = [
    '天然石头制作，每块形状独一无二',
    '手工转印，有真实手作质感',
    '成品表面亮面有光泽，适合摆放展示',
    '可以定制个人照片，纪念意义更强',
    '可搭配小木架、礼盒、贺卡，送礼更完整',
  ];

  return (
    <section className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="mb-16 text-center">
            <p className="mb-3 text-2xl font-bold text-[#1d1d1f]">石头印画定制</p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-[#1d1d1f] sm:text-4xl">
              把你的照片，印进一块独一无二的石头里
            </h2>
            <p className="mx-auto max-w-2xl text-base text-[#555555]">
              通过手工转印工艺，把照片制作到天然石头表面。每一块石头都有不同的形状和纹理，所以每一件成品都是独一无二的。
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-20">
            <h3 className="mb-8 text-center text-lg font-semibold text-[#1d1d1f]">适合定制什么？</h3>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((c) => (
                <div key={c.title} className="rounded-2xl border border-black/8 bg-white/70 p-5 text-center shadow-sm backdrop-blur-lg transition-all duration-300 hover:border-black/12 hover:shadow-md">
                  <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-xl">
                    <img src={c.image} alt={c.title} className="h-full w-full object-cover" />
                  </div>
                  <h4 className="mb-1 text-sm font-semibold text-[#1d1d1f]">{c.title}</h4>
                  <p className="text-xs text-[#555555]">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-20">
            <h3 className="mb-8 text-center text-lg font-semibold text-[#1d1d1f]">为什么选择石头印画？</h3>
            <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-black/8 bg-white/70 p-8 shadow-sm backdrop-blur-lg">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f]">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                  <span className="text-sm text-[#333333]">{f}</span>
                </div>
              ))}
              <p className="mt-4 border-t border-black/8 pt-4 text-center text-sm text-[#555555]">
                普通照片容易被遗忘，但石头印画可以长期摆放在身边。
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-20">
            <h3 className="mb-8 text-center text-lg font-semibold text-[#1d1d1f]">定制流程</h3>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {process.map((step, i) => (
                <div key={step.step} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-black/8 bg-white/70 p-4 text-center shadow-sm backdrop-blur-lg transition-all hover:border-black/12 hover:shadow-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1d1f]">
                      <step.icon size={16} className="text-white" />
                    </div>
                    <span className="text-xs font-semibold text-[#1d1d1f]">{step.title}</span>
                    <span className="text-[10px] text-[#444444]">{step.desc}</span>
                  </div>
                  {i < process.length - 1 && <ArrowRight size={14} className="hidden shrink-0 text-[#444444] sm:block" />}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 加入我们 ── */
function JoinUsSection() {
  const advantages = [
    { title: '产品新奇', desc: '第一次看到"把照片印到石头上"就会产生好奇' },
    { title: '过程好看', desc: '制作过程非常适合做短视频内容' },
    productValueProps[0],
    { title: '情绪价值高', desc: '宠物、情侣、纪念日，适合做礼物' },
    { title: '成本可控', desc: '材料成本不高，利润可观' },
  ];

  const platforms = [
    { name: '抖音', color: '#000000', icon: <svg viewBox="0 0 48 48" className="h-7 w-7"><path fill="#000" d="M34.1 10.2A7.5 7.5 0 0129 4h-5.5v26.5a4.5 4.5 0 01-4.5 4.3 4.5 4.5 0 01-4.5-4.5 4.5 4.5 0 014.5-4.5c.5 0 .9.1 1.3.2V20.5c-.4 0-.9-.1-1.3-.1a10 10 0 00-10 10 10 10 0 0010 1 10 10 0 0010-10V18a13 13 0 007 2.5V15a7.5 7.5 0 01-3.4-4.8z"/></svg> },
    { name: '视频号', color: '#FA9D3B', icon: <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill="#FA9D3B"/><path d="M16 18l14 6-14 6V18z" fill="#fff"/></svg> },
    { name: '小红书', color: '#FE2C55', icon: <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill="#FE2C55"/><path d="M17 14v20l7-5 7 5V14H17z" fill="#fff"/></svg> },
    { name: '快手', color: '#FF4906', icon: <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill="#FF4906"/><path d="M15 20l4 4 6-6 8 8-6 6-8-8-4 4V20z" fill="#fff"/></svg> },
    { name: '朋友圈', color: '#07C160', icon: <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill="#07C160"/><circle cx="24" cy="24" r="8" fill="none" stroke="#fff" strokeWidth="2.5"/><circle cx="24" cy="24" r="3" fill="#fff"/></svg> },
    { name: '私域社群', color: '#1d1d1f', icon: <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill="#1d1d1f"/><circle cx="20" cy="20" r="4" fill="#fff"/><circle cx="30" cy="20" r="4" fill="#fff"/><circle cx="24" cy="30" r="4" fill="#fff"/></svg> },
  ];

  const methods = [
    { title: '成品定制成交', desc: '客户发照片，确认后付款制作发货' },
    { title: '私域复购成交', desc: '通过案例展示、节日活动持续成交' },
    { title: '合伙人合作成交', desc: '学习项目操作，成为合伙人变现' },
  ];

  return (
    <section className="relative overflow-hidden py-24">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.01) 0%, transparent 60%)' }} />
      <div className="relative z-10 mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="mb-16 text-center">
            <p className="mb-3 text-2xl font-bold text-[#1d1d1f]">月入十万</p>
            <h2 className="mb-4 text-4xl font-bold tracking-tight text-[#1d1d1f] sm:text-5xl">
              适合普通人的轻资产手作项目
            </h2>
            <p className="mx-auto max-w-2xl text-base text-[#555555]">
              通过短视频内容、AI视频生成等方式引流，再通过定制石头印画产品实现成交变现。
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-16">
            <h3 className="mb-6 text-center text-lg font-semibold text-[#1d1d1f]">项目优势</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {advantages.map((a) => (
                <div key={a.title} className="rounded-2xl border border-black/8 bg-white/70 p-4 text-center shadow-sm backdrop-blur-lg transition-all hover:border-black/12 hover:shadow-md">
                  <h4 className="mb-1 text-sm font-semibold text-[#1d1d1f]">{a.title}</h4>
                  <p className="text-xs text-[#555555]">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-16">
            <h3 className="mb-6 text-center text-lg font-semibold text-[#1d1d1f]">获客平台</h3>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {platforms.map((p) => (
                <div key={p.name} className="flex flex-col items-center gap-2 rounded-2xl border border-black/6 bg-white p-4 shadow-sm transition-all hover:border-black/12 hover:shadow-md">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    {p.icon}
                  </div>
                  <span className="text-xs font-medium text-[#1d1d1f]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-16">
            <h3 className="mb-6 text-center text-lg font-semibold text-[#1d1d1f]">成交方式</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {methods.map((m) => (
                <div key={m.title} className="rounded-2xl border border-black/8 bg-white/70 p-6 shadow-sm backdrop-blur-lg transition-all hover:border-black/12 hover:shadow-md">
                  <h4 className="mb-2 text-sm font-semibold text-[#1d1d1f]">{m.title}</h4>
                  <p className="text-xs text-[#555555]">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="text-center">
            <p className="mb-6 text-xl font-semibold text-[#1d1d1f]">一块石头，一张照片，一段记忆。</p>
            <div className="flex justify-center gap-3">
              <Link href="/shop" className="rounded-full bg-[#1d1d1f] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#333] hover:shadow-lg">
                立即定制
              </Link>
              <Link href="/partner-benefits" className="flex items-center gap-2 rounded-full border-2 border-[#1d1d1f] px-6 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all hover:bg-[#1d1d1f] hover:text-white">
                成为合伙人
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 功能展示 ── */
function FeaturesSection() {
  const features = [
    { title: 'AI对话', desc: '多模态智能体，支持文本、图片、视频交互', href: '/chat' },
    ...publicToolCards,
  ];

  return (
    <section className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-medium text-[#444444]">核心能力</p>
            <h2 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">AI赋能创作</h2>
          </div>
        </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((f) => (
                <Reveal key={f.title}>
                  <Link href={f.href} className="group flex items-start gap-5 rounded-2xl border border-black/8 bg-white/70 p-6 shadow-sm backdrop-blur-lg transition-all hover:border-black/12 hover:shadow-md">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d1d1f]">
                      <ArrowRight size={16} className="text-white transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div>
                      <h3 className="mb-1 text-base font-semibold text-[#1d1d1f]">{f.title}</h3>
                      <p className="text-sm text-[#555555]">{f.desc}</p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
      </div>
    </section>
  );
}

/* ── 页脚 ── */
function Footer() {
  return (
    <footer className="border-t border-black/5 py-12">
      <div className="mx-auto max-w-5xl px-5">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1d1d1f]">
              <span className="text-[9px] font-black tracking-tight text-white">NF</span>
            </div>
            <span className="text-sm text-[#555555]">南风石印工坊</span>
          </div>
          <p className="text-xs text-[#555555]">© 2025 南风石印工坊. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

/* ── 主页 ── */
export default function HomePage() {
  const { openLoginModal } = useAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      <Navbar onLoginClick={openLoginModal} />
      <main>
        <HeroSection onStartCreate={() => setCreateModalOpen(true)} />
        <StoneIntroSection />
        <JoinUsSection />
        <FeaturesSection />
      </main>
      <Footer />
      {/* 开始创作选择弹窗 */}
      {createModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl bg-white/90 backdrop-blur-2xl border border-black/[0.06] p-8 shadow-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-[#1d1d1f]">选择创作类型</h3>
              <p className="text-[#555555] mt-1">选择你想要开始的创作方式</p>
            </div>
            <div className="space-y-3">
              <Link href="/image-gen" onClick={() => setCreateModalOpen(false)} className="group flex items-center gap-4 rounded-xl border border-black/[0.06] bg-[#f5f5f7]/50 backdrop-blur-sm p-4 transition-all hover:bg-[#f5f5f7] hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/[0.04] text-xl transition-transform group-hover:scale-110">
                  <ImageIcon className="h-6 w-6 text-[#1d1d1f]" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[#1d1d1f]">AI 生图</div>
                  <div className="text-sm text-[#555555]">生成高清图片、修复画质、更换风格</div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#999]" />
              </Link>
              <Link href="/video-gen" onClick={() => setCreateModalOpen(false)} className="group flex items-center gap-4 rounded-xl border border-black/[0.06] bg-[#f5f5f7]/50 backdrop-blur-sm p-4 transition-all hover:bg-[#f5f5f7] hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/[0.04] text-xl transition-transform group-hover:scale-110">
                  <Video className="h-6 w-6 text-[#1d1d1f]" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[#1d1d1f]">AI 视频</div>
                  <div className="text-sm text-[#555555]">Seedance 模型生成视频，支持音频</div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#999]" />
              </Link>
              <Link href="/workflow" onClick={() => setCreateModalOpen(false)} className="group flex items-center gap-4 rounded-xl border border-black/[0.06] bg-[#f5f5f7]/50 backdrop-blur-sm p-4 transition-all hover:bg-[#f5f5f7] hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/[0.04] text-xl transition-transform group-hover:scale-110">
                  <Workflow className="h-6 w-6 text-[#1d1d1f]" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[#1d1d1f]">石画工作流</div>
                  <div className="text-sm text-[#555555]">上传图案→12宫格分镜→生成视频</div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#999]" />
              </Link>
            </div>
            <button onClick={() => setCreateModalOpen(false)} className="mt-6 w-full rounded-xl border border-black/[0.06] py-3 text-sm font-medium text-[#555555] transition-colors hover:bg-[#f5f5f7]">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
