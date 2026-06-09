import { BookOpen, Crown, Gem, Users, type LucideIcon } from "lucide-react";

export type ShopCategory = "all" | "custom" | "tutorial" | "recruit" | "agent";

export interface ShopProduct {
  id: string;
  name: string;
  desc: string;
  price: number;
  originalPrice?: number;
  category: Exclude<ShopCategory, "all">;
  tag?: string;
  tagColor?: string;
  features: string[];
  detailFeatures: string[];
  gradient: string;
  icon: LucideIcon;
  image?: string;
  limit?: string;
  specs?: string[];
}

export const shopProducts: ShopProduct[] = [
  {
    id: "1",
    name: "7-8cm 石头定制",
    desc: "适合自用、尝鲜、普通纪念，每份两个",
    price: 109,
    category: "custom",
    tag: "入门首选",
    tagColor: "bg-[#0a84ff]/15 text-[#0a84ff]",
    features: ["天然石头 7-8cm", "每份两个", "手工转印工艺", "亮面有光泽"],
    detailFeatures: [
      "天然石头，每块形状独一无二",
      "手工转印，照片永久附着",
      "亮面光泽，适合桌面摆放",
      "含小木架，可直接展示",
      "7-8cm尺寸，小巧精致",
      "每份2个，性价比之选",
    ],
    gradient: "from-[#0a84ff]/10 to-[#0a84ff]/5",
    icon: Gem,
    image: "/stone-7-8cm.png",
    specs: [
      "尺寸: 7-8cm",
      "数量: 每份2个",
      "工艺: 手工转印",
      "表面: 亮面光泽",
      "配送: 顺丰包邮",
    ],
  },
  {
    id: "2",
    name: "8-10cm 石头定制",
    desc: "更大尺寸，更多细节呈现，每份两个",
    price: 129,
    category: "custom",
    tag: "热销",
    tagColor: "bg-[#30d158]/15 text-[#30d158]",
    features: ["天然石头 8-10cm", "每份两个", "手工转印工艺", "亮面有光泽"],
    detailFeatures: [
      "8-10cm中等尺寸，画面更清晰",
      "更多细节呈现，色彩更丰富",
      "手工转印，质感高级",
      "适合宠物、情侣、家人照片",
      "每份2个，送礼自用两相宜",
      "含小木架+精美包装",
    ],
    gradient: "from-[#30d158]/10 to-[#30d158]/5",
    icon: Gem,
    image: "/stone-8-10cm.png",
    specs: [
      "尺寸: 8-10cm",
      "数量: 每份2个",
      "工艺: 手工转印",
      "表面: 亮面光泽",
      "配送: 顺丰包邮",
    ],
  },
  {
    id: "3",
    name: "10-15cm 石头定制",
    desc: "大尺寸精品，画面细节丰富，每份两个",
    price: 159,
    category: "custom",
    tag: "精品",
    tagColor: "bg-[#ff9f0a]/15 text-[#ff9f0a]",
    features: ["天然石头 10-15cm", "每份两个", "手工转印工艺", "亮面有光泽"],
    detailFeatures: [
      "10-15cm大尺寸，画面震撼",
      "细节丰富，色彩还原度高",
      "适合全家福、风景照、纪念图",
      "手工精制，每一件都是孤品",
      "含小木架+礼盒+贺卡",
      "节日送礼、收藏展示首选",
    ],
    gradient: "from-[#ff9f0a]/10 to-[#ff9f0a]/5",
    icon: Gem,
    image: "/stone-10-15cm.png",
    specs: [
      "尺寸: 10-15cm",
      "数量: 每份2个",
      "工艺: 手工转印",
      "表面: 亮面光泽",
      "配送: 顺丰包邮",
      "含: 小木架+礼盒",
    ],
  },
  {
    id: "4",
    name: "会员教程",
    desc: "送10张转印纸，可做40-80个石头",
    price: 99,
    category: "tutorial",
    tag: "超值",
    tagColor: "bg-[#bf5af2]/15 text-[#bf5af2]",
    features: [
      "送10张转印纸",
      "可做40-80个石头",
      "摆摊·收藏·亲子·纪念",
      "完整教程指导",
    ],
    detailFeatures: [
      "赠送10张A4转印纸",
      "每张可做4-8个石头，共40-80个",
      "完整视频+图文教程",
      "适合摆摊、收藏、亲子手工",
      "孩子娱乐、家庭纪念好帮手",
      "零基础也能轻松上手",
    ],
    gradient: "from-[#bf5af2]/10 to-[#bf5af2]/5",
    icon: BookOpen,
    image: "/tutorial-kit.jpeg",
    specs: [
      "内容: 完整教程+转印纸",
      "转印纸: 10张A4",
      "产出: 40-80个石头",
      "适合: 摆摊/收藏/亲子",
      "形式: 视频+图文",
    ],
  },
  {
    id: "5",
    name: "收徒 · 合伙人",
    desc: "开通AI短视频获客，打造一人公司",
    price: 599,
    category: "recruit",
    tag: "限额1000人",
    tagColor: "bg-[#ff375f]/15 text-[#ff375f]",
    limit: "限额1000人",
    features: [
      "AI短视频获客",
      "转印纸6折",
      "送10个99会员",
      "会员收入50%分润",
      "推荐徒弟奖励50%",
    ],
    detailFeatures: [
      "AI帮你做视频，直接发布即可获客",
      "打造一人公司，扶持年入30万",
      "转印纸6折拿货，利润更高",
      "赠送10个99会员名额",
      "卖出会员50%分润",
      "推荐徒弟奖励50%",
    ],
    gradient: "from-[#ff375f]/10 to-[#ff375f]/5",
    icon: Users,
    image: "/partner-recruit.jpeg",
    specs: [
      "名额: 限额1000人",
      "AI获客: 视频生成+发布",
      "转印纸: 6折",
      "赠送: 10个99会员",
      "分润: 会员50%",
      "推荐奖: 徒弟50%",
    ],
  },
  {
    id: "6",
    name: "代理 · 核心合伙人",
    desc: "1v1流量扶持，扶持100人年入50万",
    price: 1999,
    category: "agent",
    tag: "限额100人",
    tagColor: "bg-[#ff9f0a]/15 text-[#ff9f0a]",
    limit: "限额100人",
    features: [
      "1v1流量扶持打造计划",
      "转印纸全网最低代理价",
      "送10个599徒弟",
      "会员80%分润",
      "徒弟80%分润",
      "推荐代理50%分润",
    ],
    detailFeatures: [
      "1对1流量扶持打造计划",
      "转印纸全网最低代理价",
      "赠送10个599徒弟名额",
      "卖出会员80%分润",
      "卖出徒弟80%分润",
      "推荐代理50%分润",
    ],
    gradient: "from-[#ff9f0a]/10 to-[#ff9f0a]/5",
    icon: Crown,
    image: "/agent-crown.jpeg",
    specs: [
      "名额: 限额100人",
      "扶持: 1v1流量打造",
      "转印纸: 全网最低价",
      "赠送: 10个599徒弟",
      "分润: 会员80%",
      "分润: 徒弟80%",
      "推荐: 代理50%",
    ],
  },
];

export const shopCategories: { id: ShopCategory; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "custom", label: "石头定制" },
  { id: "tutorial", label: "会员教程" },
  { id: "recruit", label: "收徒" },
  { id: "agent", label: "代理" },
];
