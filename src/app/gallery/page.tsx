'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Star, Filter, ChevronDown, MessageCircle, Share2, Eye } from 'lucide-react';

interface GalleryItem {
  id: string;
  image: string;
  category: string;
  title: string;
  description: string;
  author: string;
  rating: number;
  likes: number;
  comment: string;
}

const GALLERY_ITEMS: GalleryItem[] = [
  { id: '1', image: '/gallery-pet.jpeg', category: 'pet', title: '猫咪纪念石', description: '把我家小橘印在石头上，每天都能看到它', author: '喵星人家长', rating: 5, likes: 128, comment: '太逼真了！朋友都问我在哪做的' },
  { id: '2', image: '/gallery-couple.jpeg', category: 'couple', title: '七夕纪念石', description: '把我们合照印在石头上，比照片更有质感', author: '小甜甜', rating: 5, likes: 96, comment: '男朋友收到特别感动' },
  { id: '3', image: '/gallery-family.jpeg', category: 'family', title: '全家福定制', description: '今年全家福不洗照片了，印在石头上更有意义', author: '幸福的家', rating: 5, likes: 156, comment: '妈妈特别喜欢，摆在客厅了' },
  { id: '4', image: '/gallery-landscape.jpeg', category: 'landscape', title: '西藏旅行纪念', description: '把旅途中最美的风景印在石头上', author: '旅行者小王', rating: 4, likes: 73, comment: '每次看到都会想起那段旅程' },
  { id: '5', image: '/gallery-memorial.jpeg', category: 'memorial', title: '永远的陪伴', description: '用石头留住最珍贵的记忆', author: '思念', rating: 5, likes: 201, comment: '非常有温度的纪念方式' },
  { id: '6', image: '/gallery-pet.jpeg', category: 'pet', title: '毛孩子永远在身边', description: '我家狗子12岁了，提前做个纪念', author: '柴犬控', rating: 5, likes: 89, comment: '做工很精细，细节都保留了' },
  { id: '7', image: '/gallery-couple.jpeg', category: 'couple', title: '结婚纪念日礼物', description: '结婚五周年，把婚纱照印在石头上', author: '甜蜜夫妇', rating: 5, likes: 142, comment: '比传统的相框特别多了' },
  { id: '8', image: '/gallery-family.jpeg', category: 'family', title: '宝宝百天纪念', description: '宝宝百天照印在石头上，小巧可爱', author: '新手妈妈', rating: 5, likes: 167, comment: '送给长辈们都特别喜欢' },
  { id: '9', image: '/gallery-landscape.jpeg', category: 'landscape', title: '家乡的记忆', description: '把老家的山印在石头上，随身带着', author: '北漂小陈', rating: 4, likes: 61, comment: '每次想家就看看' },
  { id: '10', image: '/gallery-memorial.jpeg', category: 'memorial', title: '送给最好的老师', description: '毕业时把班级合照印在石头上送老师', author: '高三毕业生', rating: 5, likes: 94, comment: '老师收到很感动' },
  { id: '11', image: '/gallery-pet.jpeg', category: 'pet', title: '兔兔石头画', description: '我家兔兔也太上镜了吧', author: '养兔大户', rating: 4, likes: 52, comment: '朋友看了都想做' },
  { id: '12', image: '/gallery-couple.jpeg', category: 'couple', title: '异地恋的石头', description: '一人一块，想念的时候摸摸石头', author: '异地恋人', rating: 5, likes: 183, comment: '很有仪式感' },
];

const CATEGORIES = [
  { key: 'all', label: '全部作品' },
  { key: 'pet', label: '宠物纪念' },
  { key: 'couple', label: '情侣礼物' },
  { key: 'family', label: '家人纪念' },
  { key: 'landscape', label: '风景旅行' },
  { key: 'memorial', label: '特别纪念' },
];

export default function GalleryPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const filteredItems = selectedCategory === 'all'
    ? GALLERY_ITEMS
    : GALLERY_ITEMS.filter(item => item.category === selectedCategory);

  const toggleLike = (id: string) => {
    setLikedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/home" className="p-2 hover:bg-black/[0.04] rounded-xl transition"><ArrowLeft className="w-5 h-5" /></Link>
            <span className="font-semibold text-[#1d1d1f]">作品展示</span>
          </div>
          <Link href="/shop" className="text-sm text-[#86868b] hover:text-[#1d1d1f] transition">去定制</Link>
        </div>
      </nav>

      {/* Hero Banner */}
      <div className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-[#1d1d1f] mb-4">真实作品 · 真实感动</h1>
          <p className="text-[#86868b] text-lg max-w-xl mx-auto">每一块石头都承载着独特的故事，看看其他人的定制作品</p>
          <div className="flex items-center justify-center gap-6 mt-8 text-sm text-[#6e6e73]">
            <span className="flex items-center gap-1"><Heart className="w-4 h-4 text-red-400" />{GALLERY_ITEMS.reduce((s, i) => s + i.likes, 0)}+ 喜欢</span>
            <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" />{GALLERY_ITEMS.length} 作品</span>
            <span className="flex items-center gap-1"><Eye className="w-4 h-4" />8600+ 浏览</span>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="sticky top-14 z-30 bg-white/80 backdrop-blur-lg border-b border-black/[0.04]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            <Filter className="w-4 h-4 text-[#86868b] shrink-0" />
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
                  selectedCategory === cat.key
                    ? 'bg-[#1d1d1f] text-white'
                    : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-black/[0.08]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map((item, idx) => (
            <div
              key={item.id}
              className={`group bg-white rounded-2xl border border-black/[0.06] overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer ${
                mounted ? 'animate-fadeInUp' : 'opacity-0'
              }`}
              style={{ animationDelay: `${idx * 60}ms` }}
              onClick={() => setSelectedItem(item)}
            >
              <div className="relative aspect-square overflow-hidden">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <button
                  onClick={(e) => { e.stopPropagation(); toggleLike(item.id); }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center transition hover:scale-110"
                >
                  <Heart className={`w-4 h-4 transition ${likedItems.has(item.id) ? 'fill-red-500 text-red-500' : 'text-[#6e6e73]'}`} />
                </button>
              </div>
              <div className="p-3">
                <h3 className="font-medium text-[#1d1d1f] text-sm truncate">{item.title}</h3>
                <p className="text-xs text-[#86868b] mt-1 line-clamp-1">{item.description}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: item.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-[#86868b]">{item.likes + (likedItems.has(item.id) ? 1 : 0)} 喜欢</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-20">
            <p className="text-[#86868b]">该分类暂无作品</p>
          </div>
        )}
      </div>

      {/* CTA Section */}
      <div className="bg-[#f5f5f7] py-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] mb-4">也想做一块属于自己的石头？</h2>
          <p className="text-[#86868b] mb-8">上传照片，我们帮你把它印进石头里</p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/shop" className="px-8 py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:scale-105 transition">去定制</Link>
            <Link href="/home" className="px-8 py-3 bg-white text-[#1d1d1f] rounded-xl font-medium border border-black/[0.1] hover:scale-105 transition">返回首页</Link>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setSelectedItem(null)}>
          <div className="bg-white w-full md:max-w-lg md:rounded-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <img src={selectedItem.image} alt={selectedItem.title} className="w-full aspect-square object-cover" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-[#1d1d1f]">{selectedItem.title}</h2>
                <button onClick={() => toggleLike(selectedItem.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f5f5f7] hover:bg-red-50 transition">
                  <Heart className={`w-4 h-4 ${likedItems.has(selectedItem.id) ? 'fill-red-500 text-red-500' : 'text-[#86868b]'}`} />
                  <span className="text-sm">{selectedItem.likes + (likedItems.has(selectedItem.id) ? 1 : 0)}</span>
                </button>
              </div>
              <p className="text-[#6e6e73] mb-4">{selectedItem.description}</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#f5f5f7] flex items-center justify-center text-sm font-medium text-[#1d1d1f]">{selectedItem.author[0]}</div>
                <div>
                  <p className="text-sm font-medium text-[#1d1d1f]">{selectedItem.author}</p>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: selectedItem.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
              </div>
              {/* Customer Review */}
              <div className="bg-[#f5f5f7] rounded-xl p-4 mb-6">
                <p className="text-sm text-[#1d1d1f] mb-2 font-medium">客户评价</p>
                <p className="text-sm text-[#6e6e73]">&ldquo;{selectedItem.comment}&rdquo;</p>
              </div>
              <div className="flex gap-3">
                <Link href="/shop" className="flex-1 py-3 bg-[#1d1d1f] text-white rounded-xl text-center font-medium hover:scale-[1.02] transition">我也想做</Link>
                <button onClick={() => setSelectedItem(null)} className="px-6 py-3 bg-[#f5f5f7] text-[#1d1d1f] rounded-xl font-medium hover:scale-[1.02] transition">关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
