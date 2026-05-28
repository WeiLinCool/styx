'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import {
  ArrowLeft,
  ShoppingCart,
  User,
  Check,
  X,
  Plus,
  Minus,
  Gem,
  BookOpen,
  Users,
  Crown,
  Sparkles,
  Truck,
  Shield,
  Gift,
  ChevronRight,
  Package,
  Star,
  Info,
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  desc: string;
  price: number;
  originalPrice?: number;
  category: 'custom' | 'tutorial' | 'recruit' | 'agent';
  tag?: string;
  tagColor?: string;
  features: string[];
  detailFeatures: string[];
  gradient: string;
  icon: typeof Gem;
  image?: string;
  limit?: string;
  specs?: string[];
}

const products: Product[] = [
  {
    id: '1',
    name: '7-8cm 石头定制',
    desc: '适合自用、尝鲜、普通纪念，每份两个',
    price: 109,
    category: 'custom',
    tag: '入门首选',
    tagColor: 'bg-[#0a84ff]/15 text-[#0a84ff]',
    features: ['天然石头 7-8cm', '每份两个', '手工转印工艺', '亮面有光泽'],
    detailFeatures: ['天然石头，每块形状独一无二', '手工转印，照片永久附着', '亮面光泽，适合桌面摆放', '含小木架，可直接展示', '7-8cm尺寸，小巧精致', '每份2个，性价比之选'],
    gradient: 'from-[#0a84ff]/10 to-[#0a84ff]/5',
    icon: Gem,
    image: '/stone-7-8cm.png',
    specs: ['尺寸: 7-8cm', '数量: 每份2个', '工艺: 手工转印', '表面: 亮面光泽', '配送: 顺丰包邮'],
  },
  {
    id: '2',
    name: '8-10cm 石头定制',
    desc: '更大尺寸，更多细节呈现，每份两个',
    price: 129,
    category: 'custom',
    tag: '热销',
    tagColor: 'bg-[#30d158]/15 text-[#30d158]',
    features: ['天然石头 8-10cm', '每份两个', '手工转印工艺', '亮面有光泽'],
    detailFeatures: ['8-10cm中等尺寸，画面更清晰', '更多细节呈现，色彩更丰富', '手工转印，质感高级', '适合宠物、情侣、家人照片', '每份2个，送礼自用两相宜', '含小木架+精美包装'],
    gradient: 'from-[#30d158]/10 to-[#30d158]/5',
    icon: Gem,
    image: '/stone-8-10cm.png',
    specs: ['尺寸: 8-10cm', '数量: 每份2个', '工艺: 手工转印', '表面: 亮面光泽', '配送: 顺丰包邮'],
  },
  {
    id: '3',
    name: '10-15cm 石头定制',
    desc: '大尺寸精品，画面细节丰富，每份两个',
    price: 159,
    category: 'custom',
    tag: '精品',
    tagColor: 'bg-[#ff9f0a]/15 text-[#ff9f0a]',
    features: ['天然石头 10-15cm', '每份两个', '手工转印工艺', '亮面有光泽'],
    detailFeatures: ['10-15cm大尺寸，画面震撼', '细节丰富，色彩还原度高', '适合全家福、风景照、纪念图', '手工精制，每一件都是孤品', '含小木架+礼盒+贺卡', '节日送礼、收藏展示首选'],
    gradient: 'from-[#ff9f0a]/10 to-[#ff9f0a]/5',
    icon: Gem,
    image: '/stone-10-15cm.png',
    specs: ['尺寸: 10-15cm', '数量: 每份2个', '工艺: 手工转印', '表面: 亮面光泽', '配送: 顺丰包邮', '含: 小木架+礼盒'],
  },
  {
    id: '4',
    name: '会员教程',
    desc: '送10张转印纸，可做40-80个石头',
    price: 99,
    category: 'tutorial',
    tag: '超值',
    tagColor: 'bg-[#bf5af2]/15 text-[#bf5af2]',
    features: ['送10张转印纸', '可做40-80个石头', '摆摊·收藏·亲子·纪念', '完整教程指导'],
    detailFeatures: ['赠送10张A4转印纸', '每张可做4-8个石头，共40-80个', '完整视频+图文教程', '适合摆摊、收藏、亲子手工', '孩子娱乐、家庭纪念好帮手', '零基础也能轻松上手'],
    gradient: 'from-[#bf5af2]/10 to-[#bf5af2]/5',
    icon: BookOpen,
    image: '/tutorial-kit.jpeg',
    specs: ['内容: 完整教程+转印纸', '转印纸: 10张A4', '产出: 40-80个石头', '适合: 摆摊/收藏/亲子', '形式: 视频+图文'],
  },
  {
    id: '5',
    name: '收徒 · 合伙人',
    desc: '开通AI短视频获客，打造一人公司',
    price: 599,
    category: 'recruit',
    tag: '限额1000人',
    tagColor: 'bg-[#ff375f]/15 text-[#ff375f]',
    limit: '限额1000人',
    features: ['AI短视频获客', '转印纸6折', '送10个99会员', '会员收入50%分润', '推荐徒弟奖励50%'],
    detailFeatures: ['AI帮你做视频，直接发布即可获客', '打造一人公司，扶持年入30万', '转印纸6折拿货，利润更高', '赠送10个99会员名额', '卖出会员50%分润', '推荐徒弟奖励50%'],
    gradient: 'from-[#ff375f]/10 to-[#ff375f]/5',
    icon: Users,
    image: '/partner-recruit.jpeg',
    specs: ['名额: 限额1000人', 'AI获客: 视频生成+发布', '转印纸: 6折', '赠送: 10个99会员', '分润: 会员50%', '推荐奖: 徒弟50%'],
  },
  {
    id: '6',
    name: '代理 · 核心合伙人',
    desc: '1v1流量扶持，扶持100人年入50万',
    price: 1999,
    category: 'agent',
    tag: '限额100人',
    tagColor: 'bg-[#ff9f0a]/15 text-[#ff9f0a]',
    limit: '限额100人',
    features: ['1v1流量扶持打造计划', '转印纸全网最低代理价', '送10个599徒弟', '会员80%分润', '徒弟80%分润', '推荐代理50%分润'],
    detailFeatures: ['1对1流量扶持打造计划', '转印纸全网最低代理价', '赠送10个599徒弟名额', '卖出会员80%分润', '卖出徒弟80%分润', '推荐代理50%分润'],
    gradient: 'from-[#ff9f0a]/10 to-[#ff9f0a]/5',
    icon: Crown,
    image: '/agent-crown.jpeg',
    specs: ['名额: 限额100人', '扶持: 1v1流量打造', '转印纸: 全网最低价', '赠送: 10个599徒弟', '分润: 会员80%', '分润: 徒弟80%', '推荐: 代理50%'],
  },
];

interface CartItem {
  product: Product;
  quantity: number;
}

type Category = 'all' | 'custom' | 'tutorial' | 'recruit' | 'agent';

function ShopNav() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  return (
    <nav className="apple-nav fixed top-0 right-0 left-0 z-50 border-b border-black/[0.06]">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1 text-[#555555] transition-colors hover:text-[#1d1d1f]">
            <ArrowLeft size={18} />
            <span className="hidden text-sm sm:inline">返回</span>
          </Link>
          <div className="h-4 w-px bg-black/[0.08]" />
          <span className="text-sm font-semibold tracking-tight text-[#1d1d1f]">南风商城</span>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-2">
              <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
              <span className="hidden text-xs text-[#555555] sm:inline">{user.nickname}</span>
            </div>
          ) : (
            <Link href="/home" className="apple-btn apple-btn-secondary px-4 py-1.5 text-xs">
              登录
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default function ShopPage() {
  const [category, setCategory] = useState<Category>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  const filteredProducts = products.filter((p) => category === 'all' || p.category === category);

  const addToCart = (product: Product, qty: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + qty } : item
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const categories: { id: Category; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'custom', label: '石头定制' },
    { id: 'tutorial', label: '会员教程' },
    { id: 'recruit', label: '收徒' },
    { id: 'agent', label: '代理' },
  ];

  const openDetail = (product: Product) => {
    setDetailProduct(product);
    setDetailQuantity(1);
  };

  const closeDetail = () => {
    setDetailProduct(null);
    setDetailQuantity(1);
  };

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      <ShopNav />

      <div className="pt-12">
        {/* Hero */}
        <div className="py-16 text-center sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-[#1d1d1f] sm:text-5xl">
              石头印画
            </h1>
            <p className="mb-2 text-lg text-[#555555] sm:text-xl">
              把你的照片，印进一块独一无二的石头里
            </p>
            <p className="text-sm text-[#444444]">定制 · 教程 · 合伙 · 代理</p>
          </div>
        </div>

        {/* 服务保障 */}
        <div className="mx-auto mb-8 max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Truck, text: '顺丰包邮' },
              { icon: Shield, text: '品质保障' },
              { icon: Gift, text: '会员折扣' },
            ].map((s) => (
              <div key={s.text} className="flex items-center justify-center gap-2 rounded-xl bg-[#f5f5f7] py-3">
                <s.icon size={14} className="text-[#555555]" />
                <span className="text-xs text-[#555555]">{s.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 分类标签 */}
        <div className="mx-auto mb-8 max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-all ${
                  category === c.id
                    ? 'bg-[#1d1d1f] text-white'
                    : 'bg-[#f5f5f7] text-[#555555] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 商品网格 */}
        <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="apple-card group relative cursor-pointer overflow-hidden"
                onClick={() => openDetail(p)}
              >
                {/* 顶部图片区域 */}
                <div className={`relative h-40 bg-gradient-to-br ${p.gradient} overflow-hidden`}>
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm transition-transform group-hover:scale-110">
                        <p.icon size={24} className="text-[#1d1d1f]/70" />
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  {p.tag && (
                    <div className="absolute top-3 left-3">
                      <span className={`apple-badge ${p.tagColor || 'bg-black/[5] text-[#1d1d1f]/70'}`}>
                        {p.tag}
                      </span>
                    </div>
                  )}
                  {/* 查看详情提示 */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/10 group-hover:opacity-100">
                    <span className="flex items-center gap-1 text-sm font-medium text-white">
                      查看详情 <ChevronRight size={14} />
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="mb-1 text-base font-semibold tracking-tight text-[#1d1d1f]">{p.name}</h3>
                  <p className="mb-4 text-sm text-[#555555]">{p.desc}</p>

                  {/* 功能列表 */}
                  <div className="mb-5 space-y-2">
                    {p.features.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check size={12} className="shrink-0 text-[#30d158]" />
                        <span className="text-xs text-[#555555]">{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* 价格和加购 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-[#555555]">¥</span>
                      <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">{p.price}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                      className="apple-btn apple-btn-primary px-4 py-2 text-xs font-medium"
                    >
                      加入购物车
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-[#555555]">没有找到匹配的商品</p>
            </div>
          )}
        </div>
      </div>

      {/* 购物车浮动按钮 */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed right-6 bottom-6 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[#1d1d1f] text-white shadow-lg transition-transform hover:scale-105"
        >
          <ShoppingCart size={22} />
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ff375f] text-xs font-bold text-white">
            {cartCount}
          </span>
        </button>
      )}

      {/* 商品详情浮窗 */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeDetail}>
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeDetail}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/80 text-[#555555] backdrop-blur-sm transition-colors hover:text-[#1d1d1f]"
            >
              <X size={16} />
            </button>

            {/* 商品图片 */}
            <div className="relative h-64 overflow-hidden rounded-t-2xl bg-[#f5f5f7]">
              {detailProduct.image ? (
                <img
                  src={detailProduct.image}
                  alt={detailProduct.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <detailProduct.icon size={48} className="text-[#1d1d1f]/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              {detailProduct.tag && (
                <div className="absolute top-4 left-4">
                  <span className={`apple-badge ${detailProduct.tagColor || 'bg-white/90 text-[#1d1d1f]'}`}>
                    {detailProduct.tag}
                  </span>
                </div>
              )}
            </div>

            {/* 商品信息 */}
            <div className="p-6">
              {/* 标题 + 价格 */}
              <div className="mb-4">
                <h2 className="mb-1 text-xl font-bold tracking-tight text-[#1d1d1f]">{detailProduct.name}</h2>
                <p className="text-sm text-[#555555]">{detailProduct.desc}</p>
              </div>

              <div className="mb-5 flex items-baseline gap-2">
                <span className="text-sm text-[#555555]">¥</span>
                <span className="text-3xl font-bold tracking-tight text-[#1d1d1f]">{detailProduct.price}</span>
                {detailProduct.limit && (
                  <span className="ml-2 rounded-full bg-[#ff375f]/10 px-2 py-0.5 text-xs font-medium text-[#ff375f]">
                    {detailProduct.limit}
                  </span>
                )}
              </div>

              {/* 详细特色 */}
              <div className="mb-5">
                <div className="mb-3 flex items-center gap-2">
                  <Star size={14} className="text-[#ff9f0a]" />
                  <span className="text-sm font-semibold text-[#1d1d1f]">产品亮点</span>
                </div>
                <div className="space-y-2.5">
                  {detailProduct.detailFeatures.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Check size={14} className="mt-0.5 shrink-0 text-[#30d158]" />
                      <span className="text-sm text-[#444444]">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 规格参数 */}
              {detailProduct.specs && (
                <div className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Package size={14} className="text-[#0a84ff]" />
                    <span className="text-sm font-semibold text-[#1d1d1f]">规格参数</span>
                  </div>
                  <div className="rounded-xl bg-[#f5f5f7] p-4">
                    <div className="space-y-2">
                      {detailProduct.specs.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-xs text-[#555555]">{s.split(': ')[0]}</span>
                          <span className="text-xs font-medium text-[#1d1d1f]">{s.split(': ')[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 数量选择 */}
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <Info size={14} className="text-[#555555]" />
                  <span className="text-sm font-semibold text-[#1d1d1f]">购买数量</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center rounded-xl border border-black/[0.06] bg-[#f5f5f7]">
                    <button
                      onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center text-[#555555] transition-colors hover:text-[#1d1d1f]"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="flex h-10 w-12 items-center justify-center text-sm font-semibold text-[#1d1d1f]">
                      {detailQuantity}
                    </span>
                    <button
                      onClick={() => setDetailQuantity((q) => Math.min(99, q + 1))}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center text-[#555555] transition-colors hover:text-[#1d1d1f]"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="text-sm text-[#555555]">
                    小计: <span className="font-bold text-[#1d1d1f]">¥{detailProduct.price * detailQuantity}</span>
                  </span>
                </div>
              </div>

              {/* 底部操作 */}
              <div className="flex gap-3">
                <button
                  onClick={() => { addToCart(detailProduct, detailQuantity); closeDetail(); }}
                  className="apple-btn apple-btn-secondary flex-1 py-3 text-sm font-medium"
                >
                  加入购物车
                </button>
                <button
                  onClick={() => { addToCart(detailProduct, detailQuantity); closeDetail(); setCartOpen(true); }}
                  className="apple-btn apple-btn-primary flex-1 py-3 text-sm font-medium"
                >
                  立即购买
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 购物车抽屉 - 优化为白底苹果风格 */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setCartOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col border-l border-black/[0.06] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-[#1d1d1f]" />
                <h3 className="text-lg font-semibold tracking-tight text-[#1d1d1f]">购物车</h3>
                <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-xs font-medium text-[#555555]">{cartCount}</span>
              </div>
              <button onClick={() => setCartOpen(false)} className="cursor-pointer text-[#555555] hover:text-[#1d1d1f]">
                <X size={20} />
              </button>
            </div>

            {/* 商品列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="py-20 text-center">
                  <ShoppingCart size={40} className="mx-auto mb-3 text-[#1d1d1f]/15" />
                  <p className="text-[#555555]">购物车为空</p>
                  <p className="mt-1 text-xs text-[#444444]">点击商品查看详情并加购</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex gap-3 rounded-xl bg-[#f5f5f7] p-3 transition-all hover:bg-[#eaeaec]">
                      {/* 商品图片 */}
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                        {item.product.image ? (
                          <img src={item.product.image} alt={item.product.name} className="h-full w-full object-cover" />
                        ) : (
                          <item.product.icon size={20} className="text-[#1d1d1f]/30" />
                        )}
                      </div>
                      {/* 商品信息 */}
                      <div className="flex flex-1 flex-col justify-between min-w-0">
                        <div>
                          <h4 className="truncate text-sm font-semibold text-[#1d1d1f]">{item.product.name}</h4>
                          <p className="text-xs text-[#555555]">¥{item.product.price}/个</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateCartQuantity(item.product.id, -1)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#555555] transition-colors hover:border-[#1d1d1f] hover:text-[#1d1d1f]"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="min-w-[24px] text-center text-sm font-semibold text-[#1d1d1f]">{item.quantity}</span>
                            <button
                              onClick={() => updateCartQuantity(item.product.id, 1)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#555555] transition-colors hover:border-[#1d1d1f] hover:text-[#1d1d1f]"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-[#1d1d1f]">¥{item.product.price * item.quantity}</span>
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="cursor-pointer text-[#444444] hover:text-[#ff375f]"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 底部结算 */}
            {cart.length > 0 && (
              <div className="border-t border-black/[0.06] bg-[#f5f5f7] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[#555555]">共 {cartCount} 件商品</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-[#555555]">合计</span>
                    <span className="text-2xl font-bold tracking-tight text-[#1d1d1f]">¥{cartTotal}</span>
                  </div>
                </div>
                <button className="apple-btn apple-btn-primary w-full py-3 text-sm font-medium">
                  去结算
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
