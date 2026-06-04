'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Heart,
  Eye,
  Paintbrush,
  Gift,
  ClipboardList,
  Shield,
  Sparkles,
  Video,
  Camera,
  MessageSquare,
  ShoppingBag,
  Headphones,
  Gem,
  Palette,
  Wand2,
  Clock,
  X,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { useRouter } from 'next/navigation';

const benefits = [
  {
    icon: Heart,
    emoji: '❤️',
    title: '专属定制',
    desc: '支持宠物、情侣、家庭、风景等照片定制',
    detail: {
      title: '专属定制服务',
      sections: [
        {
          subtitle: '多场景定制',
          items: ['宠物照片定制 — 猫咪、狗狗等萌宠纪念', '情侣照片定制 — 纪念日、情人节专属礼物', '家人照片定制 — 宝宝照、亲子照、全家福', '风景照片定制 — 旅行记忆、城市风光', '纪念类图片 — 重要时刻、特别画面'],
        },
        {
          subtitle: '定制流程',
          items: ['第一步：发送你想定制的照片', '第二步：确认图片效果，沟通调整', '第三步：手工制作，转印到天然石头', '第四步：成品确认与展示', '第五步：包装发出，搭配木架礼盒贺卡'],
        },
        {
          subtitle: '可选套餐',
          items: ['基础定制款 — 单块石头，适合自用尝鲜', '礼盒定制款 — 石头+木架+礼盒+贺卡', '宠物纪念款 — 专属宠物纪念摆件', '情侣纪念款 — 纪念日专属定制', '家庭纪念款 — 亲子全家福定制', '批量定制款 — 婚礼伴手礼、企业礼品'],
        },
      ],
    },
  },
  {
    icon: Eye,
    emoji: '✨',
    title: '效果确认',
    desc: '制作前沟通需求，完成后展示成品效果',
    detail: {
      title: '效果确认保障',
      sections: [
        {
          subtitle: '制作前沟通',
          items: ['提交照片后专属客服1对1沟通', '根据石头形状确认图片适配方案', '提前告知预期效果与注意事项', '支持更换照片或调整方案'],
        },
        {
          subtitle: '制作中反馈',
          items: ['制作过程可随时查看进度', '关键节点拍照确认', '转印前最终确认图片位置', '不满意可申请重新制作'],
        },
        {
          subtitle: '完成后展示',
          items: ['成品高清多角度实拍展示', '确认满意后再包装发出', '支持7天内售后沟通', '运输损坏免费补发'],
        },
      ],
    },
  },
  {
    icon: Paintbrush,
    emoji: '🖌️',
    title: '手工制作',
    desc: '刷转印液、照片反贴、搓洗显影，真实手作工艺',
    detail: {
      title: '手工制作工艺',
      sections: [
        {
          subtitle: '制作工序',
          items: ['选石 — 精选天然石，每块形状独一无二', '清洁 — 仔细清洁石头表面，确保转印效果', '刷转印液 — 均匀涂抹专用转印液', '照片反贴 — 将打印照片反贴于石面', '按压包裹 — 均匀按压排出气泡', '湿润纸背 — 浸湿纸张背面', '搓洗显影 — 小心搓去纸层，图案显现', '晾干封层 — 自然晾干后涂保护层'],
        },
        {
          subtitle: '工艺特色',
          items: ['纯手工操作，非机器印刷', '每块石头因纹理不同而效果独特', '成品表面亮面有光泽', '图案持久不掉色', '天然质感与手工温度'],
        },
      ],
    },
  },
  {
    icon: Gift,
    emoji: '🎁',
    title: '包装发出',
    desc: '搭配小木架、礼盒、贺卡，适合送礼',
    detail: {
      title: '包装与配送',
      sections: [
        {
          subtitle: '包装选项',
          items: ['基础包装 — 防震泡沫+纸盒安全包装', '精品包装 — 小木架+礼盒+丝带', '全套礼盒 — 木架+礼盒+贺卡+干花装饰', '批量包装 — 企业定制统一包装方案'],
        },
        {
          subtitle: '配送说明',
          items: ['全国包邮（偏远地区除外）', '制作完成后1-2个工作日发出', '顺丰/京东物流可追踪', '支持加急制作与配送', '运输损坏免费补发'],
        },
      ],
    },
  },
  {
    icon: ClipboardList,
    emoji: '📋',
    title: '进度反馈',
    desc: '下单后可沟通制作进度与发货安排',
    detail: {
      title: '进度追踪',
      sections: [
        {
          subtitle: '订单状态',
          items: ['待确认 — 客服确认图片效果', '制作中 — 手工转印制作', '已完成 — 成品展示确认', '已发出 — 物流追踪', '已签收 — 完成订单'],
        },
        {
          subtitle: '沟通渠道',
          items: ['在线客服实时沟通', '微信1对1服务', '订单备注留言', '制作过程照片反馈'],
        },
      ],
    },
  },
  {
    icon: Shield,
    emoji: '🛡️',
    title: '售后保障',
    desc: '收到后如有问题可及时联系处理',
    detail: {
      title: '售后保障服务',
      sections: [
        {
          subtitle: '保障范围',
          items: ['7天无理由退换', '运输损坏免费补发', '制作瑕疵免费重做', '图片不符免费调整'],
        },
        {
          subtitle: '售后流程',
          items: ['拍照记录问题', '联系客服说明情况', '客服评估后给出方案', '确认方案后快速处理'],
        },
      ],
    },
  },
  {
    icon: Sparkles,
    emoji: '🤖',
    title: 'AI赋能创作',
    desc: 'AI生图、AI视频、AI工作流，智能辅助创作',
    detail: {
      title: 'AI赋能创作',
      sections: [
        {
          subtitle: 'AI生图',
          items: ['多种AI图片模型可选', '文字描述即可生成精美图片', '高清修复旧照片', '一键更换图片风格', '支持参考图引导生成'],
        },
        {
          subtitle: 'AI视频',
          items: ['Seedance视频生成模型', '文字描述生成短视频', '图片转视频动画', '多清晰度选择(480P/720P/1080P)', '多种视频风格预设'],
        },
        {
          subtitle: 'AI工作流',
          items: ['上传图案一键生成分镜', '12宫格自动构图', 'AI场景生成与推荐', '提示词智能优化', '一键开始造梦生成视频'],
        },
        {
          subtitle: 'AI对话',
          items: ['多模态智能对话', '创作灵感推荐', '提示词优化建议', '石印工艺咨询', '24小时在线AI助手'],
        },
      ],
    },
  },
  {
    icon: Video,
    emoji: '🎬',
    title: 'AI视频工作流',
    desc: '上传图案→分镜生成→场景选择→造梦出片',
    detail: {
      title: 'AI视频工作流',
      sections: [
        {
          subtitle: '第一步：上传图案',
          items: ['支持上传JPG/PNG格式图片', '多种AI图片模型可选', '一键提交生成'],
        },
        {
          subtitle: '第二步：分镜生成',
          items: ['AI自动生成12宫格分镜图', '可取消或重新生成', '支持自定义修改提示词'],
        },
        {
          subtitle: '第三步：场景选择',
          items: ['预设场景模板一键应用', '自定义场景描述', 'AI智能生成场景推荐'],
        },
        {
          subtitle: '第四步：开始造梦',
          items: ['Seedance视频模型生成', '多种风格与时长选择', '实时预览生成进度', '成品下载与分享'],
        },
      ],
    },
  },
  {
    icon: ShoppingBag,
    emoji: '🛍️',
    title: '商城优惠',
    desc: '会员享受商城折扣与专属优惠',
    detail: {
      title: '商城优惠权益',
      sections: [
        {
          subtitle: '会员折扣',
          items: ['月度会员享商城9折优惠', '年度会员享商城8折优惠', '限时活动会员专属折扣', '新品上架会员优先购买'],
        },
        {
          subtitle: '专属优惠',
          items: ['生日当月额外折扣', '会员专属优惠券', '节日限定礼包', '积分兑换商品'],
        },
      ],
    },
  },
  {
    icon: Headphones,
    emoji: '🎧',
    title: '专属客服',
    desc: '优先客服支持，月度及以上会员专享',
    detail: {
      title: '客服支持权益',
      sections: [
        {
          subtitle: '免费版',
          items: ['在线工单提交', '48小时内回复', '基础问题解答'],
        },
        {
          subtitle: '月度会员',
          items: ['优先客服通道', '12小时内回复', '制作问题专项支持'],
        },
        {
          subtitle: '年度会员',
          items: ['1对1专属客服', '即时响应', '定制方案咨询', 'VIP售后通道'],
        },
      ],
    },
  },
  {
    icon: Gem,
    emoji: '💎',
    title: '石头定制特权',
    desc: '年度会员专属石头定制特权与优惠',
    detail: {
      title: '石头定制特权',
      sections: [
        {
          subtitle: '年度会员专享',
          items: ['每月1次免费石头定制', '定制服务8折优惠', '优先制作排期', '专属石料选择权'],
        },
        {
          subtitle: '高级定制',
          items: ['大尺寸石头优先选材', '复杂图案专属方案', '礼盒免费升级', '刻字签名服务'],
        },
      ],
    },
  },
  {
    icon: Palette,
    emoji: '🎨',
    title: '全部场景模板',
    desc: '解锁全部石纹模板与创作场景',
    detail: {
      title: '场景模板权益',
      sections: [
        {
          subtitle: '免费版',
          items: ['基础石纹模板3套', '简单背景模板'],
        },
        {
          subtitle: '月度会员',
          items: ['全部石纹模板解锁', '节日主题模板', '宠物/情侣/家庭专属模板', '每月更新新模板'],
        },
        {
          subtitle: '年度会员',
          items: ['全部模板+自定义模板', '上传自定义背景', '品牌定制模板', '商业用途授权'],
        },
      ],
    },
  },
];

export default function UserBenefitsPage() {
  const [visible, setVisible] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState<number | null>(null);
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();

  useEffect(() => { setVisible(true); }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/home" className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft size={18} />
              <span className="hidden text-sm sm:inline">返回首页</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm font-semibold text-foreground">用户权益</span>
          </div>
          <div className="flex items-center gap-3">
            {isLoggedIn && user ? (
              <div className="flex items-center gap-2">
                <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                <span className="hidden text-xs text-foreground sm:inline">{user.nickname}</span>
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 pt-20 pb-16">
        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="h-px w-16 bg-[#1d1d1f]/20" />
            <span className="text-foreground/30 text-sm">◆</span>
            <div className="h-px w-16 bg-[#1d1d1f]/20" />
          </div>
          <h1 className="mb-4 text-4xl font-bold text-foreground md:text-5xl">
            用户权益
          </h1>
          <p className="text-lg text-muted-foreground">
            用心做好每一块石头 · 让每一份回忆历久弥新
          </p>
        </div>

        {/* Benefits Grid - 3x4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {benefits.map((b, i) => (
            <div
              key={i}
              className={`group cursor-pointer transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${i * 80}ms` }}
              onClick={() => setSelectedBenefit(i)}
            >
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 backdrop-blur-md transition-all duration-300 group-hover:-translate-y-1 group-hover:border-ring group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                {/* Icon */}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-xl">
                  {b.emoji}
                </div>

                {/* Title */}
                <h3 className="mb-1.5 text-lg font-bold text-foreground">
                  {b.title}
                </h3>

                {/* Divider */}
                <div className="mb-2.5 h-0.5 w-8 rounded-full bg-foreground/10" />

                {/* Description */}
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  {b.desc}
                </p>

                {/* Click hint */}
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                  <span>查看详情</span>
                  <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-16 transition-all duration-1000 delay-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-all duration-200 hover:scale-[1.02] hover:bg-primary/85 active:scale-[0.98]"
          >
            立即定制
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedBenefit !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setSelectedBenefit(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 flex items-center justify-between rounded-t-3xl border-b border-border bg-card px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-lg">
                  {benefits[selectedBenefit].emoji}
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {benefits[selectedBenefit].detail.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedBenefit(null)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-secondary transition-colors hover:bg-secondary/80"
              >
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-6">
              {benefits[selectedBenefit].detail.sections.map((section, si) => (
                <div key={si}>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                    <div className="h-4 w-1 rounded-full bg-foreground" />
                    {section.subtitle}
                  </h3>
                  <div className="space-y-2">
                    {section.items.map((item, ii) => (
                      <div key={ii} className="flex items-start gap-2.5 text-sm">
                        <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                        <span className="leading-relaxed text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 flex gap-3 rounded-b-3xl border-t border-border bg-card px-6 py-4">
              <button
                onClick={() => setSelectedBenefit(null)}
                className="flex-1 cursor-pointer rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                返回
              </button>
              <Link
                href="/membership"
                className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
              >
                升级会员
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
