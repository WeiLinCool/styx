'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, BookOpen, Video, ChevronRight, Lock, CheckCircle, Crown, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface Tutorial {
  id: string;
  title: string;
  desc: string;
  category: string;
  duration: string;
  type: 'video' | 'article';
  free: boolean;
  requireLevel: 'free' | 'vip' | 'partner';
  steps?: string[];
}

const TUTORIALS: Tutorial[] = [
  { id: 't1', title: '石头印画入门指南', desc: '从零开始了解石头印画的全部流程', category: 'basic', duration: '10分钟', type: 'article', free: true, requireLevel: 'vip', steps: ['了解石头印画', '准备工具材料', '选石与打磨', '转印操作步骤', '上光保护', '成品展示'] },
  { id: 't2', title: '转印液调配教程', desc: '详细讲解转印液的正确调配比例和注意事项', category: 'basic', duration: '8分钟', type: 'video', free: true, requireLevel: 'vip', steps: ['材料清单', '调配比例', '搅拌技巧', '保存方法'] },
  { id: 't3', title: '照片选择与预处理', desc: '如何选择适合转印的照片，以及预处理技巧', category: 'basic', duration: '6分钟', type: 'article', free: true, requireLevel: 'vip', steps: ['照片分辨率要求', '色彩调整技巧', '尺寸匹配', '打印设置'] },
  { id: 't4', title: '搓洗显影技巧', desc: '最关键的一步——如何正确搓洗出清晰图案', category: 'skill', duration: '12分钟', type: 'video', free: true, requireLevel: 'vip', steps: ['湿润技巧', '搓洗力度', '判断时机', '常见问题'] },
  { id: 't5', title: 'AI生图制作石头图案', desc: '用AI工具生成适合石头转印的图案', category: 'ai', duration: '15分钟', type: 'video', free: false, requireLevel: 'partner', steps: ['选择AI模型', '编写提示词', '生成图案', '后处理优化', '打印准备'] },
  { id: 't6', title: 'AI视频工作流全教程', desc: '从上传图案到生成12宫格分镜再到视频的完整流程', category: 'ai', duration: '20分钟', type: 'video', free: false, requireLevel: 'partner', steps: ['上传图案', '选择模型', '生成分镜', '场景设置', '视频生成'] },
  { id: 't7', title: '抖音短视频获客教程', desc: '如何用石头印画内容在抖音获得流量', category: 'business', duration: '18分钟', type: 'video', free: false, requireLevel: 'partner', steps: ['账号定位', '内容策划', '拍摄技巧', '发布策略', '评论区运营'] },
  { id: 't8', title: '私域成交话术', desc: '从咨询到成交的完整话术体系', category: 'business', duration: '14分钟', type: 'article', free: false, requireLevel: 'partner', steps: ['欢迎话术', '需求挖掘', '价格沟通', '促成下单', '售后跟进'] },
  { id: 't9', title: '小红书笔记获客', desc: '小红书平台的内容创作和引流方法', category: 'business', duration: '16分钟', type: 'video', free: false, requireLevel: 'partner', steps: ['选题策划', '封面设计', '文案写作', '标签优化', '互动引流'] },
  { id: 't10', title: '摆摊实战经验', desc: '石头印画线下摆摊的全部技巧和注意事项', category: 'business', duration: '22分钟', type: 'video', free: false, requireLevel: 'partner', steps: ['选址技巧', '物料准备', '展示方式', '定价策略', '现场互动'] },
];

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'basic', label: '基础入门' },
  { key: 'skill', label: '进阶技巧' },
  { key: 'ai', label: 'AI赋能' },
  { key: 'business', label: '获客变现' },
];

export default function TutorialPage() {
  const router = useRouter();
  const { isLoggedIn, user, openLoginModal } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [completedTutorials, setCompletedTutorials] = useState<Set<string>>(new Set());
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showUpgradeTip, setShowUpgradeTip] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);

  const userLevel = user?.userLevel || 'free';
  const isVip = ['vip', 'svip', 'partner', 'core_partner'].includes(userLevel);
  const isPartner = ['partner', 'core_partner'].includes(userLevel);

  const canPlayTutorial = (t: Tutorial): boolean => {
    if (t.free && t.requireLevel === 'vip') return isVip;
    if (t.requireLevel === 'partner') return isPartner;
    return true;
  };

  const filteredTutorials = selectedCategory === 'all'
    ? TUTORIALS
    : TUTORIALS.filter(t => t.category === selectedCategory);

  const toggleComplete = (id: string) => {
    setCompletedTutorials(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleVideoPlay = () => {
    if (!selectedTutorial) return;

    if (selectedTutorial.free && selectedTutorial.requireLevel === 'free') {
      setVideoPlaying(true);
      return;
    }

    if (!isLoggedIn) {
      openLoginModal();
      return;
    }

    if (!canPlayTutorial(selectedTutorial)) {
      setShowUpgradeTip(true);
      return;
    }

    setVideoPlaying(true);
  };

  // Reset video state when tutorial changes
  useEffect(() => {
    setVideoPlaying(false);
    setShowUpgradeTip(false);
  }, [selectedTutorial]);

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/home" className="p-2 hover:bg-black/[0.04] rounded-xl transition"><ArrowLeft className="w-5 h-5" /></Link>
            <span className="font-semibold text-[#1d1d1f]">南风学院</span>
          </div>
          <span className="text-sm text-[#86868b]">已学 {completedTutorials.size}/{TUTORIALS.length}</span>
        </div>
      </nav>

      {/* Progress Bar */}
      <div className="bg-[#f5f5f7] border-b border-black/[0.04]">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#6e6e73]">学习进度</span>
            <span className="text-sm font-medium text-[#1d1d1f]">{Math.round(completedTutorials.size / TUTORIALS.length * 100)}%</span>
          </div>
          <div className="h-2 bg-black/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-[#1d1d1f] rounded-full transition-all duration-500" style={{ width: `${completedTutorials.size / TUTORIALS.length * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="border-b border-black/[0.04]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat.key ? 'bg-[#1d1d1f] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-black/[0.08]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tutorial List */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="space-y-3">
          {filteredTutorials.map((tut) => (
            <div
              key={tut.id}
              onClick={() => setSelectedTutorial(tut)}
              className="flex items-center gap-4 p-4 bg-white border border-black/[0.06] rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tut.requireLevel === 'free' ? 'bg-[#f5f5f7]' : 'bg-[#1d1d1f]/5'}`}>
                {tut.type === 'video'
                  ? <Play className={`w-5 h-5 ${tut.requireLevel === 'free' ? 'text-[#1d1d1f]' : 'text-[#86868b]'}`} />
                  : <BookOpen className={`w-5 h-5 ${tut.requireLevel === 'free' ? 'text-[#1d1d1f]' : 'text-[#86868b]'}`} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-[#1d1d1f] truncate">{tut.title}</h3>
                  {tut.requireLevel === 'vip' && !isVip && <Lock className="w-3.5 h-3.5 text-[#86868b] shrink-0" />}
                  {tut.requireLevel === 'partner' && !isPartner && <Lock className="w-3.5 h-3.5 text-[#86868b] shrink-0" />}
                </div>
                <p className="text-sm text-[#86868b] truncate">{tut.desc}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[#86868b]">{tut.duration}</span>
                {completedTutorials.has(tut.id) ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-[#d1d1d6]" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tutorial Detail Modal */}
      {selectedTutorial && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setSelectedTutorial(null)}>
          <div className="bg-white w-full md:max-w-lg md:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Video Player Area */}
            <div ref={videoRef} className="relative w-full aspect-video bg-[#1d1d1f] flex items-center justify-center">
              {videoPlaying ? (
                /* Playing state - show animated placeholder */
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-3 animate-pulse">
                    <Video className="w-8 h-8 text-white/80" />
                  </div>
                  <p className="text-sm text-white/60">正在播放</p>
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                    <div className="h-full bg-white rounded-full animate-[progress_8s_linear_forwards]" style={{ width: '0%' }} />
                  </div>
                </div>
              ) : (
                /* Not playing - show play/lock button */
                <div className="flex flex-col items-center justify-center">
                  {canPlayTutorial(selectedTutorial) ? (
                    /* Can play - show play button */
                    <button
                      onClick={handleVideoPlay}
                      className="w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all cursor-pointer hover:scale-110"
                    >
                      <Play className="w-7 h-7 text-white ml-1" fill="white" />
                    </button>
                  ) : (
                    /* Locked - show lock button */
                    <button
                      onClick={handleVideoPlay}
                      className="flex flex-col items-center gap-2 cursor-pointer group"
                    >
                      <div className="w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-all group-hover:scale-110">
                        <Lock className="w-7 h-7 text-white/80" />
                      </div>
                      <span className="text-xs text-white/60">{selectedTutorial.requireLevel === 'vip' ? '需要会员' : '需要成为合伙人'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Course title overlay at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
                <p className="text-white text-sm font-medium truncate">{selectedTutorial.title}</p>
                <p className="text-white/60 text-xs">{selectedTutorial.duration}</p>
              </div>

              {/* Close button */}
              <button
                onClick={() => setSelectedTutorial(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition cursor-pointer"
              >
                <X className="w-4 h-4 text-white" />
              </button>

              {/* Lock badge for locked content */}
              {!canPlayTutorial(selectedTutorial) && (
                <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-black/50 rounded-full">
                  <Lock className="w-3 h-3 text-white/80" />
                  <span className="text-[11px] text-white/80">{selectedTutorial.requireLevel === 'vip' ? '会员专享' : '合伙人专享'}</span>
                </div>
              )}
            </div>

            {/* Upgrade Tip (shown when locked video play is attempted) */}
            {showUpgradeTip && (
              <div className="mx-4 mt-4 p-4 bg-[#f5f5f7] rounded-xl border border-black/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1d1d1f] flex items-center justify-center shrink-0">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    {selectedTutorial.requireLevel === 'vip' ? (
                      <>
                        <p className="font-medium text-[#1d1d1f] text-sm">开通会员解锁基础课程</p>
                        <p className="text-xs text-[#86868b] mt-0.5">会员可观看石头印画入门、转印液调配、照片预处理、搓洗显影等基础课程</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-[#1d1d1f] text-sm">成为合伙人解锁全部课程</p>
                        <p className="text-xs text-[#86868b] mt-0.5">合伙人可观看AI赋能与获客变现等全部高级课程</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      setSelectedTutorial(null);
                      router.push(selectedTutorial.requireLevel === 'vip' ? '/membership' : '/partner-benefits');
                    }}
                    className="flex-1 py-2 bg-[#1d1d1f] text-white rounded-xl text-sm font-medium hover:scale-[1.02] transition cursor-pointer"
                  >
                    {selectedTutorial.requireLevel === 'vip' ? '开通会员' : '成为合伙人'}
                  </button>
                  <button
                    onClick={() => setShowUpgradeTip(false)}
                    className="px-4 py-2 bg-white text-[#1d1d1f] rounded-xl text-sm font-medium border border-black/[0.06] hover:scale-[1.02] transition cursor-pointer"
                  >
                    稍后再说
                  </button>
                </div>
              </div>
            )}

            <div className="p-6">
              {/* Meta info */}
              <div className="flex items-center gap-2 mb-4">
                {selectedTutorial.type === 'video'
                  ? <Video className="w-4 h-4 text-[#86868b]" />
                  : <BookOpen className="w-4 h-4 text-[#86868b]" />
                }
                <span className="text-sm text-[#86868b]">{selectedTutorial.duration}</span>
                {!selectedTutorial.free && (
                  <span className="px-2 py-0.5 bg-[#f5f5f7] text-xs text-[#86868b] rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {selectedTutorial.requireLevel === 'vip' ? '会员' : '合伙人'}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">{selectedTutorial.title}</h2>
              <p className="text-[#6e6e73] mb-6">{selectedTutorial.desc}</p>

              {/* Course outline */}
              {selectedTutorial.steps && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-[#86868b] mb-3">课程大纲</h3>
                  <div className="space-y-2">
                    {selectedTutorial.steps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-[#f5f5f7] rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-medium text-[#1d1d1f] shrink-0">{idx + 1}</div>
                        <span className="text-sm text-[#1d1d1f]">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                {canPlayTutorial(selectedTutorial) ? (
                  <button
                    onClick={() => { toggleComplete(selectedTutorial.id); setSelectedTutorial(null); }}
                    className="flex-1 py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:scale-[1.02] transition cursor-pointer"
                  >
                    {completedTutorials.has(selectedTutorial.id) ? '取消完成' : '标记完成'}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedTutorial(null);
                      router.push(selectedTutorial.requireLevel === 'vip' ? '/membership' : '/partner-benefits');
                    }}
                    className="flex-1 py-3 bg-[#1d1d1f] text-white rounded-xl font-medium hover:scale-[1.02] transition cursor-pointer"
                  >
                    {selectedTutorial.requireLevel === 'vip' ? '开通会员学习' : '成为合伙人学习'}
                  </button>
                )}
                <button onClick={() => setSelectedTutorial(null)} className="px-6 py-3 bg-[#f5f5f7] text-[#1d1d1f] rounded-xl font-medium hover:scale-[1.02] transition cursor-pointer">关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
