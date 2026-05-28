'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const benefits = [
  {
    emoji: '❤️',
    title: '专属定制',
    desc: '支持宠物、情侣、家庭、风景等照片定制',
  },
  {
    emoji: '✨',
    title: '效果确认',
    desc: '制作前沟通需求，完成后展示成品效果',
  },
  {
    emoji: '🖌️',
    title: '手工制作',
    desc: '刷转印液、照片反贴、搓洗显影，真实手作工艺',
  },
  {
    emoji: '🎁',
    title: '包装发出',
    desc: '搭配小木架、礼盒、贺卡，适合送礼',
  },
  {
    emoji: '📋',
    title: '进度反馈',
    desc: '下单后可沟通制作进度与发货安排',
  },
  {
    emoji: '🛡️',
    title: '售后沟通',
    desc: '收到后如有问题可及时联系处理',
  },
];

export default function UserBenefitsPage() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-20">
        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="h-px w-16 bg-[#1d1d1f]/20" />
            <span className="text-[#1d1d1f]/30 text-sm">◆</span>
            <div className="h-px w-16 bg-[#1d1d1f]/20" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[#1d1d1f] mb-4">
            用户权益
          </h1>
          <p className="text-[#555555] text-lg">
            用心做好每一块石头 · 让每一份回忆历久弥新
          </p>
        </div>

        {/* Benefits Grid - 3x2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b, i) => (
            <div
              key={i}
              className={`group transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="p-6 rounded-2xl bg-white border border-black/[0.06] backdrop-blur-md group-hover:-translate-y-1 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all duration-300">
                {/* Emoji Icon */}
                <div className="w-14 h-14 rounded-2xl bg-[#f5f5f7] flex items-center justify-center text-2xl mb-5">
                  {b.emoji}
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">
                  {b.title}
                </h3>

                {/* Divider */}
                <div className="w-8 h-0.5 bg-[#1d1d1f]/10 rounded-full mb-3" />

                {/* Description */}
                <p className="text-[#555555] text-sm leading-relaxed">
                  {b.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-16 transition-all duration-1000 delay-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#1d1d1f] text-white font-semibold text-base hover:bg-[#333] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            立即定制
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
