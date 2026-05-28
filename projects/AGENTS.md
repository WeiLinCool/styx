# 项目上下文 — 南风AI

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **配色方案**: 白底苹果极简 (#FFFFFF / #1d1d1f / #f5f5f7 / #86868b / #6e6e73)

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── layout.tsx      # 根布局 (dark模式, AuthProvider)
│   │   ├── globals.css     # 全局样式 (黑白苹果极简主题+动画)
│   │   ├── page.tsx        # 开屏首页 (Splash)
│   │   ├── home/           # 主页内容
│   │   │   └── page.tsx    # 主页 (导航+Hero+功能+工作流预览+商城预览+会员)
│   │   ├── chat/           # AI对话页面
│   │   │   └── page.tsx    # 多模态对话 (侧边栏+消息列表+快捷提问)
│   │   ├── image-gen/      # AI生图页面
│   │   │   └── page.tsx    # 图片生成 (风格预设+提示词+参考图+尺寸)
│   │   ├── video-gen/      # AI视频页面
│   │   │   └── page.tsx    # 视频生成 (Seedance模型+风格+时长+音频)
│   │   ├── workflow/       # AI视频工作流页面
│   │   │   └── page.tsx    # 步骤式工作流 (上传图案→12宫格分镜→场景图+提示词+模型→导出)
│   │   ├── shop/           # 商城页面
│   │   │   └── page.tsx    # 商品列表+购物车+分类筛选
│   │   └── membership/     # 会员订阅页面
│   │       └── page.tsx    # 会员方案+功能对比+FAQ
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── lib/
│   │   ├── utils.ts        # 通用工具函数 (cn)
│   │   ├── cookie.ts       # Cookie管理 (用户信息/认证状态/开屏状态)
│   │   └── auth-context.tsx # 用户认证上下文 (React Context)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts
├── package.json
├── DESIGN.md               # 设计规范 (黑粉紫主题+石纹意象)
└── tsconfig.json
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
