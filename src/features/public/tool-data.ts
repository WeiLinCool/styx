export const imageModels = [
  { id: 'gpt-image-2', name: 'GPT Image 2.0', badge: 'New', desc: 'OpenAI最新图片生成' },
  { id: 'dall-e-3', name: 'DALL·E 3', badge: '', desc: '高质量创意图片' },
  { id: 'midjourney-v6', name: 'Midjourney V6', badge: 'Hot', desc: '艺术级图片生成' },
  { id: 'flux-pro', name: 'FLUX.1 Pro', badge: '', desc: '专业级图片生成' },
  { id: 'sdxl', name: 'Stable Diffusion XL', badge: '', desc: '开源高质量图片' },
];

export const hdModels = [
  { id: 'flux-hd', name: 'FLUX.1 HD', desc: '高清修复首选' },
  { id: 'sdxl-hd', name: 'SD XL HD', desc: '稳定高清放大' },
  { id: 'esrgan', name: 'ESRGAN', desc: '超分辨率重建' },
];

export const styleOptions = [
  { id: 'stone-print', name: '石头印画', preview: '🪨' },
  { id: 'ink-wash', name: '水墨风格', preview: '🖌️' },
  { id: 'cyberpunk', name: '赛博朋克', preview: '🌆' },
  { id: 'oil-painting', name: '油画风格', preview: '🎨' },
  { id: 'anime', name: '二次元', preview: '✨' },
  { id: 'pixel-art', name: '像素风格', preview: '👾' },
  { id: 'watercolor', name: '水彩风格', preview: '💧' },
  { id: 'sketch', name: '素描风格', preview: '✏️' },
];

export const workflowImageModels = [
  {
    id: 'gpt-image-2.0',
    name: 'GPT Image 2.0',
    desc: 'OpenAI最新图像生成模型，画质精细，适合分镜创作',
    badge: 'New',
    badgeColor: 'bg-blue-500 text-white',
    vip: false,
    logo: '🤖',
    logoBg: 'bg-green-50',
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3',
    desc: 'OpenAI旗舰模型，理解力强，构图精准',
    badge: null,
    badgeColor: '',
    vip: false,
    logo: '🎨',
    logoBg: 'bg-purple-50',
  },
  {
    id: 'midjourney-v6',
    name: 'Midjourney V6',
    desc: '艺术风格出众，质感细腻，色彩表现力强',
    badge: 'Hot',
    badgeColor: 'bg-orange-500 text-white',
    vip: true,
    logo: '✨',
    logoBg: 'bg-orange-50',
  },
  {
    id: 'flux-pro',
    name: 'FLUX.1 Pro',
    desc: '极速推理，图像质量与速度兼顾',
    badge: null,
    badgeColor: '',
    vip: false,
    logo: '⚡',
    logoBg: 'bg-yellow-50',
  },
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    desc: '开源模型，风格多样，可定制性强',
    badge: null,
    badgeColor: '',
    vip: false,
    logo: '🌊',
    logoBg: 'bg-blue-50',
  },
];

export const workflowVideoModels = [
  {
    id: 'seedance-2.0-fast-vip',
    name: 'Seedance 2.0 Fast VIP',
    desc: '极速推理，会员专属通道，音视图文均可参考',
    badge: 'New',
    badgeColor: 'bg-blue-500 text-white',
    vip: true,
    logo: '🎬',
    logoBg: 'bg-red-50',
  },
  {
    id: 'seedance-2.0-vip',
    name: 'Seedance 2.0 VIP',
    desc: '全模态能力，会员专属通道，音视图文均可参考',
    badge: 'New',
    badgeColor: 'bg-blue-500 text-white',
    vip: true,
    logo: '🌟',
    logoBg: 'bg-amber-50',
  },
  {
    id: 'seedance-2.0-fast',
    name: 'Seedance 2.0 Fast',
    desc: '高性价比，音视图文均可参考',
    badge: 'New',
    badgeColor: 'bg-blue-500 text-white',
    vip: false,
    logo: '⚡',
    logoBg: 'bg-green-50',
  },
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    desc: '全能王者，音视图文均可参考',
    badge: null,
    badgeColor: '',
    vip: false,
    logo: '🎯',
    logoBg: 'bg-indigo-50',
  },
];

export const toolSizes = [
  { label: '1:1', w: 1024, h: 1024 },
  { label: '16:9', w: 1024, h: 576 },
  { label: '9:16', w: 576, h: 1024 },
  { label: '4:3', w: 1024, h: 768 },
];
