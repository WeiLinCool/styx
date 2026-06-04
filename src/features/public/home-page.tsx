'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { HomepageContent } from '@/features/public/home-content';
import { filterMenuItemsByPermissions } from '@/features/public/permissioned-menu';
import {
  Menu, X, ArrowRight, Camera, Check, Hammer, Truck, Star,
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
function Navbar({
  nav,
  onLoginClick,
  permissionCodes,
}: {
  nav: HomepageContent['nav'];
  onLoginClick: () => void;
  permissionCodes: string[];
}) {
  const router = useRouter();
  const { user, isLoggedIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const links = filterMenuItemsByPermissions(nav.publicNavLinks, permissionCodes);

  return (
    <nav className={`fixed top-3 right-0 left-0 z-50 px-4 transition-all duration-500 ${scrolled ? 'opacity-100' : 'opacity-100'}`}>
      <div
        className={`mx-auto flex h-12 max-w-5xl items-center justify-between rounded-2xl border px-5 transition-all duration-500 ${
          scrolled
            ? 'border-border bg-background/80 shadow-lg shadow-black/5 backdrop-blur-2xl'
            : 'border-border/80 bg-background/65 shadow-md shadow-black/3 backdrop-blur-2xl'
        }`}
      >
        <Link href="/home" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[10px] font-black tracking-tight text-primary-foreground">NF</div>
          <span className="text-sm font-semibold tracking-tight text-foreground">南风石印工坊</span>
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          <Link href="/home" className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-all hover:bg-accent/12 hover:text-foreground hover:backdrop-blur-md">
            首页
          </Link>
          {isLoggedIn && user ? (
            <Link href="/my-assets" className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-all hover:bg-accent/12 hover:text-foreground hover:backdrop-blur-md">
              我的资料
            </Link>
          ) : null}
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-all hover:bg-accent/12 hover:text-foreground hover:backdrop-blur-md">
              {l.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-foreground outline-none transition-all hover:bg-accent/12 hover:backdrop-blur-md data-[state=open]:bg-accent/12">
              探索
              <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 rounded-xl border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-2xl">
              {nav.publicExploreLinks.map((l) => (
                <DropdownMenuItem key={l.href} asChild className="cursor-pointer rounded-lg px-3 py-2 text-foreground focus:bg-accent/12">
                  <Link href={l.href} className="flex flex-col items-start">
                    <span className="text-[13px] font-medium">{l.label}</span>
                    <span className="text-[11px] text-muted-foreground">{l.desc}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-foreground outline-none transition-all hover:bg-accent/12 hover:backdrop-blur-md data-[state=open]:bg-accent/12">
              AI工具
              <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 rounded-xl border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-2xl">
              {nav.publicAiToolLinks.map((l) => (
                <DropdownMenuItem key={l.href} asChild className="cursor-pointer rounded-lg px-3 py-2 text-foreground focus:bg-accent/12">
                  <Link href={l.href} className="flex flex-col items-start">
                    <span className="text-[13px] font-medium">{l.label}</span>
                    <span className="text-[11px] text-muted-foreground">{l.desc}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle className="rounded-full border-border bg-background/80 text-foreground shadow-sm backdrop-blur-xl hover:bg-accent hover:text-accent-foreground" />
          {isLoggedIn && user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <UserAvatar avatar={user.avatar} size={32} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                <span className="text-[13px] text-foreground font-medium">{user.nickname}</span>
              </div>
              <button onClick={logout} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">退出</button>
            </div>
          ) : (
            <button onClick={onLoginClick} className="cursor-pointer rounded-full bg-primary px-5 py-1.5 text-[13px] font-medium text-primary-foreground transition-all hover:bg-primary/85">
              登录
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle className="rounded-full border-border bg-background/80 text-foreground shadow-sm backdrop-blur-xl hover:bg-accent hover:text-accent-foreground" />
          <button onClick={() => setOpen(!open)} className="cursor-pointer text-foreground">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mx-4 mt-2 overflow-hidden rounded-2xl border border-border bg-popover/88 shadow-xl backdrop-blur-2xl lg:hidden">
          <div className="flex flex-col gap-0.5 p-4">
            <Link href="/home" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[13px] text-foreground hover:bg-accent/12">
              首页
            </Link>
            {isLoggedIn && user ? (
              <Link href="/my-assets" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[13px] text-foreground hover:bg-accent/12">
                我的资料
              </Link>
            ) : null}
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[13px] text-foreground hover:bg-accent/12">
                {l.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              探索
            </div>
            {nav.publicExploreLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-5 py-2 text-[13px] text-foreground hover:bg-accent/12">
                {l.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              AI工具
            </div>
            {nav.publicAiToolLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-5 py-2 text-[13px] text-foreground hover:bg-accent/12">
                {l.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-border" />
            <div className="mt-2 flex items-center justify-between px-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">主题</span>
              <ThemeToggle className="rounded-full border-border bg-background/80 text-foreground" />
            </div>
            {isLoggedIn && user ? (
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => { setOpen(false); router.push('/user-center'); }} />
                  <span className="text-[13px] text-foreground font-medium">{user.nickname}</span>
                </div>
                <button onClick={logout} className="cursor-pointer text-xs text-muted-foreground">退出</button>
              </div>
            ) : (
              <button onClick={() => { onLoginClick(); setOpen(false); }} className="mt-1 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground">
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
function HeroSection({
  content,
  onStartCreate,
}: {
  content: HomepageContent['hero'];
  onStartCreate: () => void;
}) {
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
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--foreground)_8%,transparent)_0%,transparent_60%)]" style={{ animation: 'haloExpand 8s ease-in-out infinite' }} />
        <div className="absolute left-1/2 top-1/2 h-[200px] w-[1px] -translate-x-1/2 -translate-y-1/2 bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--foreground)_12%,transparent),transparent)]" />
      </div>

      {/* 浮动装饰 */}
      {floatingShapes.map((s, i) => (
        <div key={i} className="pointer-events-none absolute rounded-full border border-foreground/5"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.size}px`, height: `${s.size}px`, animation: `floatSlow ${s.duration}s ${s.delay}s ease-in-out infinite` }} />
      ))}

      <div className="relative z-10 mx-auto max-w-4xl px-5 py-20 text-center">
        <p className={`mb-6 text-sm font-medium tracking-widest text-muted-foreground uppercase transition-all duration-700 delay-100 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          {content.eyebrow}
        </p>
        <h1 className={`mb-6 text-6xl font-black tracking-tight text-foreground sm:text-7xl lg:text-8xl transition-all duration-700 delay-200 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`} style={{ lineHeight: 1.05 }}>
          {content.headline}
        </h1>
        <p className={`mx-auto mb-4 max-w-2xl text-xl font-medium text-foreground sm:text-2xl transition-all duration-700 delay-300 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          {content.subheadline}
        </p>
        <p className={`mx-auto mb-10 max-w-xl text-base text-muted-foreground transition-all duration-700 delay-[400ms] ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          {content.body}
        </p>
        <div className={`flex flex-col items-center gap-3 sm:flex-row sm:justify-center transition-all duration-700 delay-500 ${heroLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <button onClick={onStartCreate} className="group flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/15 transition-all hover:bg-primary/85 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
            {content.primaryCta.label} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link href={content.secondaryCta.href} className="flex items-center gap-2 rounded-full border-2 border-foreground px-8 py-3.5 text-sm font-semibold text-foreground transition-all hover:bg-foreground hover:text-background hover:scale-[1.02] active:scale-[0.98]">
            {content.secondaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── 石印介绍 ── */
const processIconMap = {
  camera: Camera,
  check: Check,
  hammer: Hammer,
  star: Star,
  truck: Truck,
};

function StoneIntroSection({ content }: { content: HomepageContent['stoneIntro'] }) {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="mb-16 text-center">
            <p className="mb-3 text-2xl font-bold text-foreground">{content.eyebrow}</p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {content.headline}
            </h2>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              {content.body}
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-20">
            <h3 className="mb-8 text-center text-lg font-semibold text-foreground">适合定制什么？</h3>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {content.categories.map((c) => (
                <div key={c.title} className="rounded-2xl border border-border bg-card/80 p-5 text-center shadow-sm backdrop-blur-lg transition-all duration-300 hover:border-foreground/12 hover:shadow-md">
                  <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-xl">
                    <img src={c.image} alt={c.title} className="h-full w-full object-cover" />
                  </div>
                  <h4 className="mb-1 text-sm font-semibold text-foreground">{c.title}</h4>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-20">
            <h3 className="mb-8 text-center text-lg font-semibold text-foreground">为什么选择石头印画？</h3>
            <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-border bg-card/80 p-8 shadow-sm backdrop-blur-lg">
              {content.features.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  </div>
                  <span className="text-sm text-foreground/88">{f}</span>
                </div>
              ))}
              <p className="mt-4 border-t border-border pt-4 text-center text-sm text-muted-foreground">
                普通照片容易被遗忘，但石头印画可以长期摆放在身边。
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-20">
            <h3 className="mb-8 text-center text-lg font-semibold text-foreground">定制流程</h3>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {content.process.map((step, i) => {
                const StepIcon = processIconMap[step.icon];
                return (
                <div key={step.step} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/80 p-4 text-center shadow-sm backdrop-blur-lg transition-all hover:border-foreground/12 hover:shadow-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                      <StepIcon size={16} className="text-primary-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{step.title}</span>
                    <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                  </div>
                  {i < content.process.length - 1 && <ArrowRight size={14} className="hidden shrink-0 text-muted-foreground sm:block" />}
                </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function renderPlatformIcon(
  icon: HomepageContent['joinUs']['platforms'][number]['icon'],
  color: string,
) {
  if (icon === 'douyin') {
    return <svg viewBox="0 0 48 48" className="h-7 w-7"><path fill={color} d="M34.1 10.2A7.5 7.5 0 0129 4h-5.5v26.5a4.5 4.5 0 01-4.5 4.3 4.5 4.5 0 01-4.5-4.5 4.5 4.5 0 014.5-4.5c.5 0 .9.1 1.3.2V20.5c-.4 0-.9-.1-1.3-.1a10 10 0 00-10 10 10 10 0 0010 1 10 10 0 0010-10V18a13 13 0 007 2.5V15a7.5 7.5 0 01-3.4-4.8z"/></svg>;
  }

  if (icon === 'shipinhao') {
    return <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill={color}/><path d="M16 18l14 6-14 6V18z" fill="#fff"/></svg>;
  }

  if (icon === 'xiaohongshu') {
    return <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill={color}/><path d="M17 14v20l7-5 7 5V14H17z" fill="#fff"/></svg>;
  }

  if (icon === 'kuaishou') {
    return <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill={color}/><path d="M15 20l4 4 6-6 8 8-6 6-8-8-4 4V20z" fill="#fff"/></svg>;
  }

  if (icon === 'wechat') {
    return <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill={color}/><circle cx="24" cy="24" r="8" fill="none" stroke="#fff" strokeWidth="2.5"/><circle cx="24" cy="24" r="3" fill="#fff"/></svg>;
  }

  return <svg viewBox="0 0 48 48" className="h-7 w-7"><rect x="6" y="6" width="36" height="36" rx="8" fill={color}/><circle cx="20" cy="20" r="4" fill="#fff"/><circle cx="30" cy="20" r="4" fill="#fff"/><circle cx="24" cy="30" r="4" fill="#fff"/></svg>;
}

/* ── 加入我们 ── */
function JoinUsSection({ content }: { content: HomepageContent['joinUs'] }) {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--foreground)_4%,transparent)_0%,transparent_60%)]" />
      <div className="relative z-10 mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="mb-16 text-center">
            <p className="mb-3 text-2xl font-bold text-foreground">{content.eyebrow}</p>
            <h2 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {content.headline}
            </h2>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              {content.body}
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-16">
            <h3 className="mb-6 text-center text-lg font-semibold text-foreground">项目优势</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {content.advantages.map((a) => (
                <div key={a.title} className="rounded-2xl border border-border bg-card/80 p-4 text-center shadow-sm backdrop-blur-lg transition-all hover:border-foreground/12 hover:shadow-md">
                  <h4 className="mb-1 text-sm font-semibold text-foreground">{a.title}</h4>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-16">
            <h3 className="mb-6 text-center text-lg font-semibold text-foreground">获客平台</h3>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {content.platforms.map((p) => (
                <div key={p.name} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-foreground/12 hover:shadow-md">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-sm">
                    {renderPlatformIcon(p.icon, p.color)}
                  </div>
                  <span className="text-xs font-medium text-foreground">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-16">
            <h3 className="mb-6 text-center text-lg font-semibold text-foreground">成交方式</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {content.methods.map((m) => (
                <div key={m.title} className="rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur-lg transition-all hover:border-foreground/12 hover:shadow-md">
                  <h4 className="mb-2 text-sm font-semibold text-foreground">{m.title}</h4>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="text-center">
            <p className="mb-6 text-xl font-semibold text-foreground">一块石头，一张照片，一段记忆。</p>
            <div className="flex justify-center gap-3">
              <Link href={content.primaryCta.href} className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/85 hover:shadow-lg">
                {content.primaryCta.label}
              </Link>
              <Link href={content.secondaryCta.href} className="flex items-center gap-2 rounded-full border-2 border-foreground px-6 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-foreground hover:text-background">
                {content.secondaryCta.label}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 功能展示 ── */
function FeaturesSection({ content }: { content: HomepageContent['aiTools'] }) {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-medium text-muted-foreground">{content.eyebrow}</p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{content.headline}</h2>
          </div>
        </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {content.tools.map((f) => (
                <Reveal key={f.label}>
                  <Link href={f.href} className="group flex items-start gap-5 rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur-lg transition-all hover:border-foreground/12 hover:shadow-md">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary">
                      <ArrowRight size={16} className="text-primary-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div>
                      <h3 className="mb-1 text-base font-semibold text-foreground">{f.label}</h3>
                      <p className="text-sm text-muted-foreground">{f.desc}</p>
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
    <footer className="border-t border-border py-12">
      <div className="mx-auto max-w-5xl px-5">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <span className="text-[9px] font-black tracking-tight text-primary-foreground">NF</span>
            </div>
            <span className="text-sm text-muted-foreground">南风石印工坊</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2025 南风石印工坊. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

/* ── 主页 ── */
export function HomePageClient({
  content,
  permissionCodes,
}: {
  content: HomepageContent;
  permissionCodes: string[];
}) {
  const { openLoginModal } = useAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar nav={content.nav} onLoginClick={openLoginModal} permissionCodes={permissionCodes} />
      <main>
        <HeroSection content={content.hero} onStartCreate={() => setCreateModalOpen(true)} />
        <StoneIntroSection content={content.stoneIntro} />
        <JoinUsSection content={content.joinUs} />
        <FeaturesSection content={content.aiTools} />
      </main>
      <Footer />
      {/* 开始创作选择弹窗 */}
      {createModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-popover/92 p-8 shadow-2xl backdrop-blur-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="mb-6 text-center">
              <h3 className="text-2xl font-bold text-foreground">选择创作类型</h3>
              <p className="mt-1 text-muted-foreground">选择你想要开始的创作方式</p>
            </div>
            <div className="space-y-3">
              <Link href="/image-gen" onClick={() => setCreateModalOpen(false)} className="group flex items-center gap-4 rounded-xl border border-border bg-secondary/60 p-4 backdrop-blur-sm transition-all hover:bg-secondary hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/6 text-xl transition-transform group-hover:scale-110">
                  <ImageIcon className="h-6 w-6 text-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground">AI 生图</div>
                  <div className="text-sm text-muted-foreground">生成高清图片、修复画质、更换风格</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
              <Link href="/video-gen" onClick={() => setCreateModalOpen(false)} className="group flex items-center gap-4 rounded-xl border border-border bg-secondary/60 p-4 backdrop-blur-sm transition-all hover:bg-secondary hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/6 text-xl transition-transform group-hover:scale-110">
                  <Video className="h-6 w-6 text-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground">AI 视频</div>
                  <div className="text-sm text-muted-foreground">Seedance 模型生成视频，支持音频</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
              <Link href="/workflow" onClick={() => setCreateModalOpen(false)} className="group flex items-center gap-4 rounded-xl border border-border bg-secondary/60 p-4 backdrop-blur-sm transition-all hover:bg-secondary hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/6 text-xl transition-transform group-hover:scale-110">
                  <Workflow className="h-6 w-6 text-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground">石画工作流</div>
                  <div className="text-sm text-muted-foreground">上传图案→12宫格分镜→生成视频</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            </div>
            <button onClick={() => setCreateModalOpen(false)} className="mt-6 w-full rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
