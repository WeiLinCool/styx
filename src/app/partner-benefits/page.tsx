'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, X, ChevronRight, QrCode, MessageCircle } from 'lucide-react';

const benefits = [
  {
    num: '01',
    emoji: '🎓',
    title: '项目培训',
    desc: '提供产品卖点、流程与起步方法',
    detail: {
      overview: '从零开始，手把手教你石头印画项目的全部流程和技巧。',
      sections: [
        { title: '产品卖点梳理', content: '深入讲解石头印画的核心卖点——新奇、定制、纪念属性，帮助你在沟通中快速打动客户。' },
        { title: '制作流程教学', content: '从选石、刷转印液、照片反贴、按压包裹、搓洗显影到成品，每一步都有详细视频指导。' },
        { title: '起步方法指导', content: '从准备材料到第一个成品，从第一条视频到第一单成交，完整的起步路径规划。' },
        { title: '常见问题解答', content: '汇总新手最常遇到的制作问题、销售问题，提供标准解决方案。' },
      ],
    },
  },
  {
    num: '02',
    emoji: '🎬',
    title: 'AI素材支持',
    desc: '提供视频提示词、脚本与内容方向',
    detail: {
      overview: '利用AI工具批量制作石头印画短视频，让内容创作不再是门槛。',
      sections: [
        { title: 'AI视频提示词', content: '提供经过验证的AI视频生成提示词，一键生成石头印画相关短视频，省去创作烦恼。' },
        { title: '视频脚本模板', content: '多种类型的视频脚本：制作过程、成品展示、客户反馈、节日推荐等，直接套用即可拍摄。' },
        { title: '内容方向规划', content: '每周内容日历，包括发布时间、内容类型、热门话题，帮你持续产出优质内容。' },
        { title: '爆款视频拆解', content: '分析平台热门石头印画视频，拆解其成功要素，帮你复制爆款模式。' },
      ],
    },
  },
  {
    num: '03',
    emoji: '👤',
    title: '账号搭建',
    desc: '头像、简介、主页与发布建议',
    detail: {
      overview: '从0开始搭建你的石头印画社交账号，让客户第一眼就信任你。',
      sections: [
        { title: '头像与简介设计', content: '提供专业的头像设计建议和简介文案模板，让账号看起来专业可信。' },
        { title: '主页装修方案', content: '主页封面、置顶内容、合集分类，全方位提升账号的专业度和吸引力。' },
        { title: '发布策略建议', content: '最佳发布时间、发布频率、标签使用，让每条视频获得更多曝光。' },
        { title: '多平台适配', content: '抖音、小红书、视频号等不同平台的内容适配策略，一套内容多平台分发。' },
      ],
    },
  },
  {
    num: '04',
    emoji: '💬',
    title: '成交话术',
    desc: '咨询回复、私信转化与成交模板',
    detail: {
      overview: '从客户咨询到成交，每一步都有标准化话术，新手也能高效转化。',
      sections: [
        { title: '咨询回复模板', content: '客户问"多少钱""能做吗""多久发货"等常见问题，提供标准回复模板，专业又不失温度。' },
        { title: '私信转化流程', content: '从公域评论到私域成交，完整的转化流程和话术，提升私信成交率。' },
        { title: '异议处理话术', content: '客户犹豫、嫌贵、比价时，如何用话术化解异议，促成成交。' },
        { title: '复购与转介绍', content: '成交后的跟进话术，引导客户复购、转介绍，实现裂变增长。' },
      ],
    },
  },
  {
    num: '05',
    emoji: '🚚',
    title: '代做代发',
    desc: '可选择引流成交、由团队制作发货',
    detail: {
      overview: '不想自己动手？没关系，你可以只做引流和成交，制作发货交给我们。',
      sections: [
        { title: '代做模式说明', content: '你负责引流和成交，收到订单后由团队制作并直接发货给客户，你无需接触实物。' },
        { title: '代做流程', content: '客户下单 → 你提供照片和地址 → 团队制作 → 顺丰发货 → 你跟踪物流。全程只需手机操作。' },
        { title: '利润说明', content: '代做模式利润略低于自制，但省去制作时间和材料成本，适合纯线上运营的合伙人。' },
        { title: '品质保障', content: '每件代做产品都经过质检，成品拍照确认后再发货，确保客户满意度。' },
      ],
    },
  },
  {
    num: '06',
    emoji: '📹',
    title: '直播支持',
    desc: '直播流程、互动话术与转化思路',
    detail: {
      overview: '直播是转化率最高的渠道，我们提供完整的直播支持方案。',
      sections: [
        { title: '直播流程规划', content: '从开播准备到下播复盘，完整的直播流程框架，新手也能轻松开播。' },
        { title: '互动话术', content: '进人欢迎、互动引导、产品介绍、逼单话术，每个环节都有标准话术参考。' },
        { title: '转化思路', content: '如何在直播中展示产品、制造紧迫感、引导下单，提升直播成交率。' },
        { title: '直播排品策略', content: '不同时段的排品策略，引流款+利润款+爆款组合，最大化直播收益。' },
      ],
    },
  },
  {
    num: '07',
    emoji: '📅',
    title: '节日活动方案',
    desc: '节点营销方案与套餐玩法',
    detail: {
      overview: '抓住每一个节日机会，提前准备好营销方案，让节日成为你的黄金销售期。',
      sections: [
        { title: '全年节日日历', content: '梳理全年适合石头印画营销的节日：情人节、母亲节、七夕、圣诞节等，提前规划不遗漏。' },
        { title: '活动方案模板', content: '每个节日都有专属活动方案：促销力度、话术、视频内容、发布节奏，直接套用。' },
        { title: '套餐玩法设计', content: '节日限定套餐、情侣套餐、家庭套餐等组合玩法，提升客单价和成交率。' },
        { title: '预热与收尾', content: '节日前7天开始预热，节日后3天收尾，完整的时间节点和内容规划。' },
      ],
    },
  },
  {
    num: '08',
    emoji: '👥',
    title: '社群答疑',
    desc: '持续答疑、案例共享与运营支持',
    detail: {
      overview: '加入合伙人专属社群，获得持续的支持和陪伴，你不是一个人在战斗。',
      sections: [
        { title: '专属社群', content: '合伙人专属微信群，有问题随时提问，团队和资深合伙人在线答疑。' },
        { title: '案例共享', content: '定期分享优秀合伙人的实战案例、成交经验、内容技巧，互相学习共同成长。' },
        { title: '运营支持', content: '遇到账号问题、流量瓶颈、转化困难，团队提供一对一分析和建议。' },
        { title: '持续更新', content: '定期更新营销素材、话术库、视频模板，确保你始终有最新的工具和资源。' },
      ],
    },
  },
];

export default function PartnerBenefitsPage() {
  const [visible, setVisible] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState<(typeof benefits)[0] | null>(null);

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
            合伙人权益
          </h1>
          <p className="text-[#555555] text-lg">
            全流程赋能，助力合伙人轻松起步，高效变现
          </p>
        </div>

        {/* Benefits Grid - 2x4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {benefits.map((b, i) => (
            <div
              key={i}
              className={`relative group cursor-pointer transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${i * 80}ms` }}
              onClick={() => setSelectedBenefit(b)}
            >
              <div className="p-6 rounded-2xl bg-white border border-black/[0.06] backdrop-blur-md group-hover:-translate-y-1 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] group-hover:border-black/[0.12] transition-all duration-300 h-full">
                {/* Number Badge */}
                <span className="inline-block text-xs font-bold text-[#1d1d1f]/30 mb-4 tracking-wider">
                  {b.num}
                </span>

                {/* Emoji Icon */}
                <div className="w-12 h-12 rounded-xl bg-[#f5f5f7] flex items-center justify-center text-2xl mb-4">
                  {b.emoji}
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">
                  {b.title}
                </h3>

                {/* Divider */}
                <div className="w-8 h-0.5 bg-[#1d1d1f]/10 rounded-full mb-3" />

                {/* Description */}
                <p className="text-[#555555] text-sm leading-relaxed mb-3">
                  {b.desc}
                </p>

                {/* 查看详情提示 */}
                <div className="flex items-center gap-1 text-xs font-medium text-[#1d1d1f]/40 group-hover:text-[#1d1d1f] transition-colors">
                  <span>了解详情</span>
                  <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-16 transition-all duration-1000 delay-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button
            onClick={() => setShowQRCode(true)}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#1d1d1f] text-white font-semibold text-base hover:bg-[#333] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            成为合伙人
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
          <p className="mt-3 text-sm text-[#444444]">扫码添加官方客服，了解合伙人详情</p>
        </div>
      </div>

      {/* 二维码弹窗 */}
      {showQRCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowQRCode(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} className="text-[#1d1d1f]" />
                <h3 className="text-lg font-bold text-[#1d1d1f]">添加官方客服</h3>
              </div>
              <button
                onClick={() => setShowQRCode(false)}
                className="cursor-pointer text-[#555555] hover:text-[#1d1d1f]"
              >
                <X size={20} />
              </button>
            </div>

            {/* 二维码区域 */}
            <div className="flex flex-col items-center">
              <div className="mb-4 flex h-52 w-52 items-center justify-center rounded-2xl border-2 border-dashed border-black/10 bg-[#f5f5f7]">
                <div className="flex flex-col items-center gap-3">
                  <QrCode size={48} className="text-[#1d1d1f]/20" />
                  <span className="text-xs text-[#444444]">二维码即将上线</span>
                </div>
              </div>
              <p className="text-center text-sm text-[#555555]">
                请使用微信扫描上方二维码<br />添加官方客服了解合伙人详情
              </p>
            </div>

            <div className="mt-6 rounded-xl bg-[#f5f5f7] p-4">
              <p className="text-center text-xs text-[#444444]">
                客服工作时间：9:00 - 21:00<br />
                咨询请注明「合伙人」
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 权益详情弹窗 */}
      {selectedBenefit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelectedBenefit(null)}>
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.06] bg-white/90 px-6 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedBenefit.emoji}</span>
                <div>
                  <h3 className="text-lg font-bold text-[#1d1d1f]">{selectedBenefit.title}</h3>
                  <span className="text-xs text-[#1d1d1f]/30">{selectedBenefit.num}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBenefit(null)}
                className="cursor-pointer text-[#555555] hover:text-[#1d1d1f]"
              >
                <X size={20} />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-6">
              {/* 概述 */}
              <p className="mb-6 text-sm leading-relaxed text-[#555555]">
                {selectedBenefit.detail.overview}
              </p>

              {/* 分项详情 */}
              <div className="space-y-4">
                {selectedBenefit.detail.sections.map((section, i) => (
                  <div key={i} className="rounded-xl bg-[#f5f5f7] p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1d1d1f] text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-[#1d1d1f]">{section.title}</h4>
                    </div>
                    <p className="pl-7 text-sm leading-relaxed text-[#555555]">{section.content}</p>
                  </div>
                ))}
              </div>

              {/* 底部操作 */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => { setSelectedBenefit(null); setShowQRCode(true); }}
                  className="apple-btn apple-btn-primary flex-1 py-3 text-sm font-medium"
                >
                  立即加入
                </button>
                <button
                  onClick={() => setSelectedBenefit(null)}
                  className="apple-btn apple-btn-secondary px-6 py-3 text-sm font-medium"
                >
                  返回
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
