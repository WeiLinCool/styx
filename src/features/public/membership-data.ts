import { Crown, Gift, Sparkles, Zap, type LucideIcon } from 'lucide-react';

export type MembershipPlanId = 'free' | 'monthly' | 'yearly';

export type MembershipPlan = {
  id: MembershipPlanId;
  name: string;
  price: number;
  period: string;
  originalPrice?: number;
  desc: string;
  icon: LucideIcon;
  iconBg: string;
  popular?: boolean;
  features: Array<{ text: string; included: boolean }>;
};

export const membershipPlans: MembershipPlan[] = [
  {
    id: 'free',
    name: '免费版',
    price: 0,
    period: '',
    desc: '体验基础石头定制功能',
    icon: Sparkles,
    iconBg: 'bg-[#f5f5f7]',
    features: [
      { text: '石头定制购买', included: true },
      { text: '效果确认与进度反馈', included: true },
      { text: '基础石纹模板(3套)', included: true },
      { text: '在线工单客服', included: true },
      { text: 'AI生图', included: false },
      { text: 'AI视频生成', included: false },
      { text: 'AI工作流', included: false },
      { text: 'AI对话', included: false },
      { text: '商城折扣', included: false },
      { text: '石头定制特权', included: false },
      { text: '全部场景模板', included: false },
      { text: '优先客服支持', included: false },
    ],
  },
  {
    id: 'monthly',
    name: '月度会员',
    price: 399,
    period: '/月',
    desc: '解锁全部AI创作能力',
    icon: Zap,
    iconBg: 'bg-[#1d1d1f]',
    popular: true,
    features: [
      { text: '石头定制购买', included: true },
      { text: '效果确认与进度反馈', included: true },
      { text: '全部场景模板', included: true },
      { text: 'AI生图', included: true },
      { text: 'AI视频生成', included: true },
      { text: 'AI工作流', included: true },
      { text: 'AI对话', included: true },
      { text: '每天100积分', included: true },
      { text: '商城9折优惠', included: true },
      { text: '优先客服支持', included: true },
      { text: '石头定制特权', included: true },
      { text: '1对1专属客服', included: false },
    ],
  },
  {
    id: 'yearly',
    name: '年度会员',
    price: 1999,
    period: '/年',
    originalPrice: 4788,
    desc: '全功能无限使用，省¥2789',
    icon: Crown,
    iconBg: 'bg-[#1d1d1f]',
    features: [
      { text: '石头定制购买', included: true },
      { text: '效果确认与进度反馈', included: true },
      { text: '全部场景模板+自定义', included: true },
      { text: 'AI生图(无限)', included: true },
      { text: 'AI视频生成(无限)', included: true },
      { text: 'AI工作流(无限)', included: true },
      { text: 'AI对话(无限)', included: true },
      { text: '每天500积分', included: true },
      { text: '商城8折优惠', included: true },
      { text: '1对1专属客服', included: true },
      { text: '石头定制特权(每月1次免费)', included: true },
      { text: '商业用途授权', included: true },
    ],
  },
];

export const membershipFaqs = [
  { q: '免费版可以使用AI功能吗？', a: '免费版不支持AI生图、AI视频、AI工作流和AI对话。升级月度或年度会员即可解锁全部AI创作能力。' },
  { q: '积分有什么用？', a: '积分用于消耗AI功能使用次数。月度会员每天100积分，年度会员每天500积分，足够日常创作使用。' },
  { q: '月度会员和年度会员有什么区别？', a: '月度会员399元/月，解锁全部AI功能，每天100积分；年度会员1999元/年（原价4788元），每天500积分，部分AI功能无限使用，8折商城优惠，每月1次免费石头定制，1对1专属客服。' },
  { q: '升级会员后原有作品会丢失吗？', a: '不会，所有作品和数据都会完整保留。' },
  { q: '年度会员支持退款吗？', a: '购买后7天内支持无理由退款，超过7天按剩余时间比例退款。' },
  { q: '石头定制特权包含什么？', a: '月度会员享受石头定制优惠价；年度会员每月可免费定制1块石头（7-8cm），超出部分8折优惠。' },
  { q: '商业用途授权是什么？', a: '年度会员使用AI生成的图片和视频可用于商业用途（自媒体、广告等），免费版和月度会员仅限个人使用。' },
];

export const membershipComparisonRows = [
  { name: '石头定制购买', free: '✓', monthly: '✓', yearly: '✓' },
  { name: '效果确认与进度反馈', free: '✓', monthly: '✓', yearly: '✓' },
  { name: '场景模板', free: '基础3套', monthly: '全部', yearly: '全部+自定义' },
  { name: 'AI生图', free: '—', monthly: '100积分/天', yearly: '无限' },
  { name: 'AI视频生成', free: '—', monthly: '100积分/天', yearly: '无限' },
  { name: 'AI工作流', free: '—', monthly: '100积分/天', yearly: '无限' },
  { name: 'AI对话', free: '—', monthly: '100积分/天', yearly: '无限' },
  { name: '每日积分', free: '—', monthly: '100', yearly: '500' },
  { name: '商城折扣', free: '—', monthly: '9折', yearly: '8折' },
  { name: '客服支持', free: '工单', monthly: '优先', yearly: '1对1专属' },
  { name: '石头定制特权', free: '—', monthly: '特权价', yearly: '每月免费1次' },
  { name: '商业用途授权', free: '—', monthly: '—', yearly: '✓' },
];

export { Gift };
