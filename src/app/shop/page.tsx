'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import { shopCategories, shopProducts, type ShopCategory, type ShopProduct } from '@/features/public/shop-data';
import {
  ArrowLeft,
  ShoppingCart,
  Check,
  X,
  Plus,
  Minus,
  Truck,
  Shield,
  Gift,
  ChevronRight,
  Package,
  Star,
  Info,
} from 'lucide-react';

interface CartItem {
  product: ShopProduct;
  quantity: number;
}

function ShopNav() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  return (
    <nav className="apple-nav fixed top-0 right-0 left-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft size={18} />
            <span className="hidden text-sm sm:inline">返回</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-semibold tracking-tight text-foreground">南风商城</span>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-2">
              <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
              <span className="hidden text-xs text-muted-foreground sm:inline">{user.nickname}</span>
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
  const { user, isLoggedIn } = useAuth();
  const [category, setCategory] = useState<ShopCategory>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ShopProduct | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;

  const filteredProducts = shopProducts.filter((p) => category === 'all' || p.category === category);

  const addToCart = (product: ShopProduct, qty: number = 1) => {
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

  const openDetail = (product: ShopProduct) => {
    setDetailProduct(product);
    setDetailQuantity(1);
  };

  const closeDetail = () => {
    setDetailProduct(null);
    setDetailQuantity(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShopNav />

      <div className="pt-12">
        {/* Hero */}
        <div className="py-16 text-center sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              石头印画
            </h1>
            <p className="mb-2 text-lg text-muted-foreground sm:text-xl">
              把你的照片，印进一块独一无二的石头里
            </p>
            <p className="text-sm text-muted-foreground">定制 · 教程 · 合伙 · 代理</p>
          </div>
        </div>

        {activationRequired && (
          <ProtectedAccountPanel accountState={user?.accountState} title="激活账号后购买商品" />
        )}

        {/* 服务保障 */}
        <div className="mx-auto mb-8 max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Truck, text: '顺丰包邮' },
              { icon: Shield, text: '品质保障' },
              { icon: Gift, text: '会员折扣' },
            ].map((s) => (
              <div key={s.text} className="flex items-center justify-center gap-2 rounded-xl bg-secondary py-3">
                <s.icon size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{s.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 分类标签 */}
        <div className="mx-auto mb-8 max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {shopCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-all ${
                  category === c.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
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
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card/80 backdrop-blur-sm transition-transform group-hover:scale-110">
                        <p.icon size={24} className="text-foreground/70" />
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  {p.tag && (
                    <div className="absolute top-3 left-3">
                      <span className={`apple-badge ${p.tagColor || 'bg-secondary text-foreground/70'}`}>
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
                  <h3 className="mb-1 text-base font-semibold tracking-tight text-foreground">{p.name}</h3>
                  <p className="mb-4 text-sm text-muted-foreground">{p.desc}</p>

                  {/* 功能列表 */}
                  <div className="mb-5 space-y-2">
                    {p.features.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check size={12} className="shrink-0 text-success" />
                        <span className="text-xs text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* 价格和加购 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-muted-foreground">¥</span>
                      <span className="text-2xl font-bold tracking-tight text-foreground">{p.price}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!activationRequired) addToCart(p); }}
                      className="apple-btn apple-btn-primary px-4 py-2 text-xs font-medium"
                    >
                      {activationRequired ? '请先激活' : '加入购物车'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-muted-foreground">没有找到匹配的商品</p>
            </div>
          )}
        </div>
      </div>

      {/* 购物车浮动按钮 */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed right-6 bottom-6 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
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
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeDetail}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
            >
              <X size={16} />
            </button>

            {/* 商品图片 */}
            <div className="relative h-64 overflow-hidden rounded-t-2xl bg-secondary">
              {detailProduct.image ? (
                <img
                  src={detailProduct.image}
                  alt={detailProduct.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <detailProduct.icon size={48} className="text-foreground/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              {detailProduct.tag && (
                <div className="absolute top-4 left-4">
                  <span className={`apple-badge ${detailProduct.tagColor || 'bg-card/90 text-foreground'}`}>
                    {detailProduct.tag}
                  </span>
                </div>
              )}
            </div>

            {/* 商品信息 */}
            <div className="p-6">
              {/* 标题 + 价格 */}
              <div className="mb-4">
                <h2 className="mb-1 text-xl font-bold tracking-tight text-foreground">{detailProduct.name}</h2>
                <p className="text-sm text-muted-foreground">{detailProduct.desc}</p>
              </div>

              <div className="mb-5 flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">¥</span>
                <span className="text-3xl font-bold tracking-tight text-foreground">{detailProduct.price}</span>
                {detailProduct.limit && (
                  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {detailProduct.limit}
                  </span>
                )}
              </div>

              {/* 详细特色 */}
              <div className="mb-5">
                <div className="mb-3 flex items-center gap-2">
                  <Star size={14} className="text-warning" />
                  <span className="text-sm font-semibold text-foreground">产品亮点</span>
                </div>
                <div className="space-y-2.5">
                  {detailProduct.detailFeatures.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Check size={14} className="mt-0.5 shrink-0 text-success" />
                      <span className="text-sm text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 规格参数 */}
              {detailProduct.specs && (
                <div className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Package size={14} className="text-info" />
                    <span className="text-sm font-semibold text-foreground">规格参数</span>
                  </div>
                  <div className="rounded-xl bg-secondary p-4">
                    <div className="space-y-2">
                      {detailProduct.specs.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{s.split(': ')[0]}</span>
                          <span className="text-xs font-medium text-foreground">{s.split(': ')[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 数量选择 */}
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <Info size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">购买数量</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center rounded-xl border border-border bg-secondary">
                    <button
                      onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="flex h-10 w-12 items-center justify-center text-sm font-semibold text-foreground">
                      {detailQuantity}
                    </span>
                    <button
                      onClick={() => setDetailQuantity((q) => Math.min(99, q + 1))}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    小计: <span className="font-bold text-foreground">¥{detailProduct.price * detailQuantity}</span>
                  </span>
                </div>
              </div>

              {/* 底部操作 */}
              <div className="flex gap-3">
                <button
                  onClick={() => { if (activationRequired) return; addToCart(detailProduct, detailQuantity); closeDetail(); }}
                  className="apple-btn apple-btn-secondary flex-1 py-3 text-sm font-medium"
                >
                  {activationRequired ? '请先激活' : '加入购物车'}
                </button>
                <button
                  onClick={() => { if (activationRequired) return; addToCart(detailProduct, detailQuantity); closeDetail(); setCartOpen(true); }}
                  className="apple-btn apple-btn-primary flex-1 py-3 text-sm font-medium"
                >
                  {activationRequired ? '请先激活' : '立即购买'}
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
            className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-foreground" />
                <h3 className="text-lg font-semibold tracking-tight text-foreground">购物车</h3>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{cartCount}</span>
              </div>
              <button onClick={() => setCartOpen(false)} className="cursor-pointer text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {/* 商品列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="py-20 text-center">
                  <ShoppingCart size={40} className="mx-auto mb-3 text-foreground/15" />
                  <p className="text-muted-foreground">购物车为空</p>
                  <p className="mt-1 text-xs text-muted-foreground">点击商品查看详情并加购</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex gap-3 rounded-xl bg-secondary p-3 transition-all hover:bg-secondary/80">
                      {/* 商品图片 */}
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card">
                        {item.product.image ? (
                          <img src={item.product.image} alt={item.product.name} className="h-full w-full object-cover" />
                        ) : (
                          <item.product.icon size={20} className="text-foreground/30" />
                        )}
                      </div>
                      {/* 商品信息 */}
                      <div className="flex flex-1 flex-col justify-between min-w-0">
                        <div>
                          <h4 className="truncate text-sm font-semibold text-foreground">{item.product.name}</h4>
                          <p className="text-xs text-muted-foreground">¥{item.product.price}/个</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateCartQuantity(item.product.id, -1)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="min-w-[24px] text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                            <button
                              onClick={() => updateCartQuantity(item.product.id, 1)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-foreground">¥{item.product.price * item.quantity}</span>
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="cursor-pointer text-muted-foreground hover:text-destructive"
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
              <div className="border-t border-border bg-secondary p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">共 {cartCount} 件商品</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">合计</span>
                    <span className="text-2xl font-bold tracking-tight text-foreground">¥{cartTotal}</span>
                  </div>
                </div>
                <button className="apple-btn apple-btn-primary w-full py-3 text-sm font-medium" disabled={activationRequired}>
                  {activationRequired ? '请先激活账号' : '去结算'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
