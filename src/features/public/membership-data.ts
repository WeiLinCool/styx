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
    desc: '体验基础功能',
    icon: Sparkles,
    iconBg: 'bg-[#f5f5f7]',
    features: [
      { text: '每日5次AI生图', included: true },
      { text: '每日1次AI视频生成', included: true },
      { text: '基础石纹模板', included: true },
      { text: '社区分享', included: true },
      { text: '高级石纹模板', included: false },
      { text: '商城折扣', included: false },
      { text: '石头定制特权', included: false },
      { text: '专属客服', included: false },
    ],
  },
  {
    id: 'monthly',
    name: '月度会员',
    price: 29,
    period: '/月',
    desc: '解锁进阶创作能力',
    icon: Zap,
    iconBg: 'bg-[#1d1d1f]',
    popular: true,
    features: [
      { text: '每日100次AI生图', included: true },
      { text: '每日20次AI视频生成', included: true },
      { text: '全部石纹模板', included: true },
      { text: '社区分享', included: true },
      { text: '高级石纹模板', included: true },
      { text: '商城9折优惠', included: true },
      { text: '优先客服支持', included: true },
      { text: '石头定制特权', included: false },
    ],
  },
  {
    id: 'yearly',
    name: '年度会员',
    price: 199,
    period: '/年',
    originalPrice: 348,
    desc: '全功能无限使用',
    icon: Crown,
    iconBg: 'bg-[#1d1d1f]',
    features: [
      { text: '无限AI生图', included: true },
      { text: '无限AI视频生成', included: true },
      { text: '全部模板+自定义', included: true },
      { text: '社区分享', included: true },
      { text: '高级石纹模板', included: true },
      { text: '商城8折优惠', included: true },
      { text: '1对1专属客服', included: true },
      { text: '石头定制特权', included: true },
    ],
  },
];

export const membershipFaqs = [
  { q: '会员可以随时取消吗？', a: '是的，您可以随时取消订阅，取消后当前周期内仍可使用会员功能。' },
  { q: '升级会员后原有作品会丢失吗？', a: '不会，所有作品和数据都会完整保留。' },
  { q: '年度会员支持退款吗？', a: '购买后7天内支持无理由退款，超过7天按剩余时间比例退款。' },
  { q: '石头定制特权包含什么？', a: '年度会员享有每月1次免费石头定制刻印服务，以及定制服务8折优惠。' },
];

export const membershipComparisonRows = [
  { name: 'AI生图', free: '5次/天', monthly: '100次/天', yearly: '无限' },
  { name: 'AI视频生成', free: '1次/天', monthly: '20次/天', yearly: '无限' },
  { name: '模板库', free: '基础', monthly: '全部', yearly: '全部+自定义' },
  { name: '输出质量', free: '480P', monthly: '720P', yearly: '1080P' },
  { name: '商城折扣', free: '—', monthly: '9折', yearly: '8折' },
  { name: '客服支持', free: '—', monthly: '优先', yearly: '1对1' },
  { name: '石头定制', free: '—', monthly: '—', yearly: '特权' },
];

export { Gift };
