'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Handshake, TrendingUp, Mountain, Target, Users, Award, Zap, Heart } from 'lucide-react';

export default function BrandStoryPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const sections = [
    {
      title: '起源',
      subtitle: '一块石头，一段故事',
      icon: Mountain,
      content: '南风石印工坊起源于一个简单的想法——为什么照片只能放在相框里？我们相信，每一张照片背后都有一段值得被永久铭记的故事。天然石头有着亿万年沉淀的纹理和质感，当照片与石头结合，就像给记忆找到了一个更永恒的家。',
      detail: '创始人偶然在河边捡起一块圆润的鹅卵石，看到它光滑的表面和天然的纹理，突然想到：如果能把最珍贵的照片印在这块石头上，那它就不再只是一块石头，而是一个承载情感的载体。于是，经过无数次试验和改进，南风石印工坊诞生了。'
    },
    {
      title: '工艺',
      subtitle: '手工转印，独一无二',
      icon: Sparkles,
      content: '每一块石头印画都经过严格的手工转印工序：选石→打磨→刷转印液→照片反贴→按压包裹→湿润纸背→搓洗显影→上光保护。8道核心工序，每一步都需要耐心和经验。正因如此，每一件成品都是独一无二的——石头的形状不同，纹理不同，转印效果也不同。',
      detail: '我们的转印工艺源自传统拓印技法，但进行了大量创新改良。关键在于"按压包裹"和"搓洗显影"两步——图案必须紧密贴合石头曲面，让画面完整包裹整个石面，不留死角。搓洗时力度的拿捏更是需要经验积累：轻了纸纤维残留，重了图案受损。每一块成品，都是匠人心血的结晶。'
    },
    {
      title: 'AI赋能',
      subtitle: '让传统工艺触手可及',
      icon: Zap,
      content: '传统手工艺需要大量时间和经验积累。我们用AI技术赋能石头印画——AI生图帮你设计图案，AI视频帮你传播内容，AI工作流帮你批量制作素材。让每一个普通人，都能轻松入门这个轻资产手作项目，打造属于自己的"一人公司"。',
      detail: '过去，学会石头印画需要拜师学艺数月。现在，AI生图可以一键生成适合转印的图案，AI视频帮你自动剪辑获客短视频，AI工作流更可以将整个制作流程标准化。技术降低了入门门槛，但不降低作品品质——手工的温度和石头的质感，是机器永远无法替代的。'
    },
    {
      title: '使命',
      subtitle: '扶持1000位普通人年入30万',
      icon: Target,
      content: '我们的使命不只是卖石头。我们希望帮助1000位普通人通过石头印画项目实现轻创业——从AI短视频获客，到手工制作成交，到合伙人体系裂变，我们提供完整的培训、工具和扶持计划。让每一个有手艺梦想的人，都能找到属于自己的舞台。',
      detail: '石头印画是一个轻资产创业项目：几十元成本的材料，就能制作出售价几十到上百元的定制作品。配合AI短视频获客，一条视频就可能带来几十个订单。我们已帮助上百位合伙人月入过万，核心合伙人月收入更是突破5万。这不是画饼，而是真实可复制的商业模式。'
    },
  ];

  const timeline = [
    { year: '2025.03', event: '南风石印工坊创立，在朋友圈接第一单石头印画定制', highlight: true },
    { year: '2025.06', event: '研发转印液配方，图案包裹率从70%提升至95%以上' },
    { year: '2025.09', event: '引入AI生图技术，图案设计效率提升10倍' },
    { year: '2025.12', event: 'AI视频工作流上线，合伙人可自动生成获客短视频' },
    { year: '2026.02', event: '上线南风AI平台，正式开放合伙人招募' },
    { year: '2026.05', event: '累计服务客户超5000人，合伙人突破200位' },
    { year: '未来', event: '扶持1000位核心合伙人，打造石头印画全国第一品牌', highlight: true },
  ];

  const stats = [
    { number: '5000+', label: '服务客户', icon: Users },
    { number: '200+', label: '城市合伙人', icon: Handshake },
    { number: '95%', label: '图案包裹率', icon: Award },
    { number: '8', label: '核心工序', icon: Heart },
  ];

  const values = [
    { emoji: '🪨', title: '真实', desc: '天然石头，手工制作，每一块都独一无二。不量产、不复制，用双手赋予每块石头灵魂。' },
    { emoji: '💡', title: '创新', desc: 'AI技术赋能传统工艺，让创作触手可及。古老技法与现代科技的碰撞，迸发全新可能。' },
    { emoji: '🤝', title: '共赢', desc: '合伙人体系，扶持普通人实现轻创业梦想。你的成功，就是我们最好的品牌故事。' },
    { emoji: '🔥', title: '温度', desc: '每一件作品都承载着客户的情感和故事。我们不只是在做石头印画，更是在传递温暖。' },
    { emoji: '🎯', title: '专注', desc: '深耕石头印画这一件事，做到极致。不被诱惑分散精力，在一个领域做到第一。' },
    { emoji: '🌱', title: '成长', desc: '持续学习和进化，从工艺到商业模式，永远保持创新的热情和成长的渴望。' },
  ];

  const processSteps = [
    { step: 1, title: '选石', desc: '挑选形状圆润、表面光滑的天然石头，确保适合转印' },
    { step: 2, title: '打磨', desc: '精细打磨石面，让表面更加平整光滑，增强附着力' },
    { step: 3, title: '刷转印液', desc: '均匀涂抹特制转印液，这是图案与石头结合的关键介质' },
    { step: 4, title: '照片反贴', desc: '将打印好的照片面朝下贴合在石面上，精准对位' },
    { step: 5, title: '按压包裹', desc: '用力按压让图案紧密包裹整个石面，不留气泡和死角' },
    { step: 6, title: '湿润纸背', desc: '用水均匀润湿纸背，让纸纤维与油墨分离' },
    { step: 7, title: '搓洗显影', desc: '轻柔搓洗纸层，图案在石面上缓缓显现，见证奇迹' },
    { step: 8, title: '上光保护', desc: '涂抹保护层，让图案持久鲜亮，历久弥新' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/home" className="rounded-xl p-2 transition hover:bg-secondary/70"><ArrowLeft className="w-5 h-5" /></Link>
            <span className="font-semibold text-foreground">品牌故事</span>
          </div>
          <Link href="/gallery" className="text-sm text-muted-foreground transition hover:text-foreground">看作品</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-24 bg-[#86868b] rounded-[40%] rotate-12" style={{ animation: 'stoneFloat 8s ease-in-out infinite' }} />
          <div className="absolute top-40 right-20 w-20 h-16 bg-[#d1d1d6] rounded-[50%] -rotate-6" style={{ animation: 'stoneFloat 10s ease-in-out infinite 2s' }} />
          <div className="absolute bottom-10 left-1/3 w-24 h-18 bg-[#aeaeb2] rounded-[45%] rotate-6" style={{ animation: 'stoneFloat 12s ease-in-out infinite 4s' }} />
        </div>
        <div className="max-w-4xl mx-auto px-4 py-20 md:py-32 text-center relative">
          <h1 className={`mb-6 text-3xl font-bold text-foreground transition-all duration-700 md:text-5xl ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            把记忆，印进石头
          </h1>
          <p className={`mx-auto max-w-xl text-lg text-muted-foreground transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            南风石印工坊，用天然石头承载你最珍贵的瞬间
          </p>
          <p className={`mx-auto mt-4 max-w-2xl text-base text-muted-foreground transition-all duration-700 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            当照片遇见石头，当记忆遇见永恒——每一块石头印画，都是一段被时光温柔对待的故事
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-secondary/60 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s, idx) => (
              <div key={idx} className="text-center">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-card">
                  <s.icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="text-2xl font-bold tabular-nums text-foreground md:text-3xl">{s.number}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Story Sections */}
      <div className="max-w-4xl mx-auto px-4">
        {sections.map((section, idx) => (
          <div key={idx} className="border-t border-border py-16">
            <div className="flex items-start gap-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                <section.icon className="h-6 w-6 text-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="mb-1 text-2xl font-bold text-foreground">{section.title}</h2>
                <p className="mb-4 text-muted-foreground">{section.subtitle}</p>
                <p className="text-[#444444] leading-relaxed">{section.content}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{section.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Process Steps */}
      <div className="bg-secondary/60 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-3 text-center text-2xl font-bold text-foreground">8道核心工序</h2>
          <p className="mb-12 text-center text-muted-foreground">从原石到成品，每一步都凝聚匠心</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {processSteps.map((p) => (
              <div key={p.step} className="rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1">
                <div className="w-8 h-8 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center text-sm font-bold mb-3">{p.step}</div>
                <h4 className="mb-1 font-semibold text-foreground">{p.title}</h4>
                <p className="text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-4xl mx-auto px-4 py-20">
        <h2 className="mb-12 text-center text-2xl font-bold text-foreground">发展历程</h2>
        <div className="relative">
          <div className="absolute bottom-0 left-8 top-0 w-px bg-border" />
          {timeline.map((item, idx) => (
            <div key={idx} className="relative flex items-start gap-6 mb-8 last:mb-0">
              <div className="relative z-10 w-16 h-8 flex items-center justify-center">
                <div className={`h-3 w-3 rounded-full ${item.highlight ? 'bg-foreground ring-4 ring-foreground/10' : 'bg-muted-foreground ring-4 ring-background'}`} />
              </div>
              <div className="flex-1 rounded-xl border border-border bg-secondary/60 p-5">
                <span className="text-xs font-medium text-muted-foreground">{item.year}</span>
                <p className="mt-1 text-foreground">{item.event}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Values */}
      <div className="bg-secondary/60 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="mb-3 text-center text-2xl font-bold text-foreground">我们的价值观</h2>
          <p className="mb-12 text-center text-muted-foreground">做有温度的手艺，做有情怀的品牌</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((v, idx) => (
              <div key={idx} className="rounded-2xl border border-border bg-card p-8 text-center transition hover:-translate-y-1">
                <div className="text-4xl mb-4">{v.emoji}</div>
                <h3 className="mb-2 text-lg font-bold text-foreground">{v.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Testimonial */}
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="bg-[#1d1d1f] rounded-3xl p-10 md:p-16 text-center">
          <p className="text-xl md:text-2xl text-white leading-relaxed mb-6">
            &ldquo;每一块石头都有它的故事，<br />
            我们只是帮它把故事讲出来。&rdquo;
          </p>
          <p className="text-muted-foreground">—— 南风石印工坊创始人</p>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-secondary/60 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">和我们一起，把故事印进石头</h2>
          <p className="mb-8 text-muted-foreground">无论你想定制作品，还是成为合伙人，我们都欢迎</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/shop" className="rounded-xl bg-foreground px-8 py-3 font-medium text-background transition hover:scale-105">去定制</Link>
            <Link href="/partner-benefits" className="rounded-xl border border-border bg-card px-8 py-3 font-medium text-foreground transition hover:scale-105">成为合伙人</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
