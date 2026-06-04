'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSplashVisited, setSplashVisited } from '@/lib/cookie';

export default function SplashPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'arrive'>('idle');
  const [particles, setParticles] = useState<{left: number; top: number; size: number; delay: number; duration: number}[]>([]);

  useEffect(() => {
    setParticles(Array.from({ length: 12 }, (_, i) => ({
      left: 5 + i * 8 + Math.random() * 4,
      top: 10 + Math.random() * 80,
      size: 2 + Math.random() * 3,
      delay: i * 0.6,
      duration: 6 + Math.random() * 6,
    })));
    const timer = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (getSplashVisited()) {
      router.replace('/home');
    }
  }, [router]);

  const handleEnter = () => {
    setSplashVisited();
    setPhase('arrive');
    setTimeout(() => {
      router.push('/home');
    }, 1200);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      {/* 极简光晕背景 */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 70%)',
            animation: 'haloExpand 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0,0,0,0.015) 0%, transparent 60%)',
            animation: 'haloExpand 10s 2s ease-in-out infinite',
          }}
        />
      </div>

      {/* 极简粒子 */}
      {loaded && particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-black/8"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `particleDrift ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}

      {/* 浮动装饰圆 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-[20%] h-24 w-24 rounded-full border border-border/40"
          style={{ animation: 'floatSlow 12s ease-in-out infinite' }} />
        <div className="absolute right-[15%] bottom-[25%] h-16 w-16 rounded-full border border-border/50"
          style={{ animation: 'floatSlow 10s 3s ease-in-out infinite' }} />
        <div className="absolute left-[20%] bottom-[15%] h-8 w-8 rounded-full bg-black/[0.02]"
          style={{ animation: 'floatSlow 8s 1s ease-in-out infinite' }} />
      </div>

      {/* 主内容 */}
      <div
        className={`relative z-10 flex flex-col items-center transition-all duration-700 ${
          loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Logo - NF */}
        <div
          className={`mb-8 transition-all duration-1000 ${
            phase === 'arrive' ? 'scale-[2.5] opacity-0 blur-xl' : 'scale-100 opacity-100'
          }`}
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-foreground shadow-lg"
            style={{ animation: 'logoBreath 4s ease-in-out infinite' }}>
            <span className="text-2xl font-bold tracking-tight text-background">NF</span>
          </div>
        </div>

        {/* 标题 */}
        <h1
          className={`mb-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl transition-all duration-700 delay-200 ${
            loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          南风石印工坊
        </h1>

        {/* 副标题 */}
        <p className={`mb-3 text-sm text-muted-foreground sm:text-base transition-all duration-700 delay-300 ${
          loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}>
          AI视频 · AI生图 · 石头印画 · AI视频工作流
        </p>

        {/* 分割线 */}
        <div className={`mb-8 h-px w-16 bg-border transition-all duration-700 delay-400 ${
          loaded ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
        }`} />

        {/* 进入按钮 */}
        <button
          onClick={handleEnter}
          disabled={phase === 'arrive'}
          className={`apple-btn apple-btn-primary px-8 py-3 text-sm font-medium tracking-wide transition-all duration-700 delay-500 ${
            loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          进入官网
        </button>

        {/* 底部文字 */}
        <p className={`mt-12 text-xs text-muted-foreground transition-all duration-700 delay-700 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}>
          石头印画 · 把记忆留在石头上
        </p>
      </div>

      {/* 到达过渡 */}
      {phase === 'arrive' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
          <div
            className="mb-4 flex h-20 w-20 items-center justify-center rounded-[22px] bg-foreground shadow-lg"
            style={{ animation: 'arriveLogo 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards' }}
          >
            <span className="text-2xl font-bold tracking-tight text-background">NF</span>
          </div>
          <p
            className="text-sm text-muted-foreground"
            style={{ animation: 'arriveReveal 0.6s 0.3s ease-out forwards', opacity: 0 }}
          >
            正在进入南风石印工坊...
          </p>
        </div>
      )}
    </div>
  );
}
