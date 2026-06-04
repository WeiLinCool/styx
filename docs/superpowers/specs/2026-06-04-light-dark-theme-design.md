# 用户端与管理端明暗主题设计

日期：2026-06-04

## 背景

当前仓库已经具备一套全局颜色 token 和 `.dark` CSS 变量，但主题能力还没有真正贯通：

- 根布局 `src/app/layout.tsx` 尚未接入全局主题 provider。
- 用户端与管理端都存在大量硬编码浅色样式，例如 `bg-white`、`text-[#1d1d1f]`、`border-black/[0.06]`。
- 亮色主题整体偏纯白，页面观感过亮，缺少更柔和的灰白层次。
- 仓库已经安装 `next-themes`，具备使用成熟主题切换方案的基础。

本次变更目标是在用户端和管理端同时引入夜间配色，并提供页面内手动切换开关；同时将亮色主题从纯白整体调整为更柔和的灰白体系。

## 范围

本次只覆盖以下范围：

- 接入全局主题能力，支持 `light`、`dark`、`system` 三态。
- 默认跟随系统主题，同时允许用户手动覆盖。
- 用户端与管理端都提供页面内可见的主题切换入口。
- 调整全局 light/dark token，使亮色不再过白，夜间不使用生硬纯黑。
- 修复用户端与管理端关键壳层中的硬编码浅色样式，使其能正确响应主题切换。
- 让 toast、下拉层等共享 UI 跟随当前主题。

明确不做：

- 不在本次引入多套品牌主题或配色自定义器。
- 不对所有业务页面逐页做完整视觉重设计。
- 不修改任何鉴权、数据库、API 语义。

## 任务分类

这是一个 Large 任务，因为它包含：

- 用户可见 UI 行为变化。
- 用户端与管理端两个表面的一致性主题能力改造。
- 全局布局、共享组件样式、页面壳层样式的跨边界调整。

## 现状与可复用基础

### 已有边界

- 全局布局：
  - `src/app/layout.tsx`
- 全局样式与 token：
  - `src/app/globals.css`
- 管理端入口与壳层：
  - `src/app/admin/(console)/layout.tsx`
  - `src/features/admin/admin-shell.tsx`
- 用户端主要入口与导航壳层：
  - `src/features/public/home-page.tsx`
- 共享 UI 主题相关组件：
  - `src/components/ui/sonner.tsx`
  - `src/components/ui/chart.tsx`

### 当前主题问题

- `globals.css` 已定义 `:root` 和 `.dark` token，但 `body` 仍写死 `background: #ffffff` 与 `color: #1d1d1f`。
- 许多关键容器没有使用语义 token，而是直接写死浅色值。
- 已安装 `next-themes`，但没有全局 `ThemeProvider`，也没有手动切换 UI。

## 状态所有权

| 状态 | Owner | 写入口 | 真相来源 |
| --- | --- | --- | --- |
| 当前主题模式 `light/dark/system` | 全局 ThemeProvider | 用户点击主题切换器 | `next-themes` 本地持久化 + `html` class |
| 系统主题偏好 | 浏览器/操作系统 | 系统外观变化 | `prefers-color-scheme` |
| 页面视觉颜色 token | `globals.css` | 代码定义 | CSS 自定义属性 |
| 页面局部 hover / border / surface 样式 | 页面壳层与共享组件 | 代码定义 | 语义 class 与 token |

## 不变量

1. 整个应用只能有一个全局主题真相源，用户端和管理端不能维护独立主题状态。
2. `system` 模式必须真实跟随操作系统主题，而不是固定映射到某一个主题。
3. 主题切换后，关键容器、弹层、toast 与导航必须同步响应，不能出现浅色孤岛。
4. 亮色主题的背景层次必须整体偏灰白，而不是回到纯白高亮观感。

## 方案选择

### 方案 1：`next-themes` 全局接管 + 语义 token 收口 + 双端共享切换器

做法：

- 在根布局接入 `ThemeProvider`。
- 使用 `attribute="class"` 驱动 `html.dark`。
- 统一支持 `light`、`dark`、`system`。
- 在用户端与管理端放置同一套主题切换器。
- 调整全局 token，并逐步替换关键页面硬编码颜色。

优点：

- 复用现有依赖与现有 `.dark` token。
- 主题真相唯一，后续扩展成本最低。
- 能保证 toast、共享组件、页面壳层行为一致。
- 符合成熟实践，hydration 与系统跟随能力更稳妥。

缺点：

- 首轮需要处理一批关键页面的硬编码颜色，改动面比纯脚本切换更大。

### 方案 2：手写 `html.dark` 管理脚本 + 局部补样式

优点：

- 短期实现更快。

缺点：

- 重复造主题状态管理。
- 更容易出现 hydration、系统跟随与共享组件不同步问题。

### 方案 3：用户端和管理端各自维护主题状态

优点：

- 局部修改表面上更独立。

缺点：

- 主题真相分裂，后续维护成本高。
- 共享组件容易出现跨端不一致。

### 推荐

采用方案 1。

## 参考研究

### Industry consensus

- Apple Dark Mode 指南建议界面优先尊重系统外观，并在深色中使用分层表面而非简单纯黑/纯白对撞。
- 成熟 Web 主题实践通常使用全局主题 provider、语义 token 和系统主题跟随，再允许用户显式覆盖。

参考：

- https://developer.apple.com/design/human-interface-guidelines/dark-mode
- https://developer.apple.com/design/human-interface-guidelines/ios/visual-design/dark-mode

### Transferable principle

- 主题状态要全局唯一。
- 深色界面要保留层次感，避免一片死黑。
- 亮色界面应通过灰白和低对比边框减少刺眼感。

### This repository's constraints

- 已有全局 token 与 Tailwind v4 语义色映射，可直接扩展。
- 用户端首页存在大量手工视觉样式，不能只靠 token 覆盖全部问题。
- 管理端更偏密集信息界面，需要保持表格、边框与导航层级清晰。

### Local design

- 使用 `next-themes` 作为唯一主题状态来源。
- light 主题统一降白，dark 主题改为深灰黑分层。
- 先收口全局与关键壳层，再让共享组件自然继承。

## 最终设计

### 主题架构

- 在根布局新增客户端主题 provider 封装。
- `ThemeProvider` 配置：
  - `attribute="class"`
  - `defaultTheme="system"`
  - `enableSystem=true`
  - 关闭不必要的切换动画干扰
- 所有页面统一依赖 `html` 上的主题 class，而不是在页面内部自己判定深浅色。

### 主题切换交互

- 提供统一的主题切换组件，支持：
  - 浅色
  - 深色
  - 跟随系统
- 用户端入口放在顶部导航区，可桌面/移动端都可达。
- 管理端入口放在头部或侧栏顶部的常驻可见位置。
- 当前选择持久化，刷新页面后仍保留用户选择。
- 当选择 `system` 时，系统外观变化应自动生效。

### 配色策略

#### 亮色主题

- 背景从纯白 `#ffffff` 下调到浅灰白基底。
- 卡片、popover、sidebar 与页面背景保持可区分但低对比的层级。
- 边框从纯黑透明改成更柔和的中性灰透明。
- 保留品牌蓝作为强调色，但避免与过白背景产生刺眼对比。

预期风格：

- 不是“纯白纸面”，而是偏 Apple / neutral 的柔和灰白界面。

#### 深色主题

- 背景不使用整页纯黑到底，改为深灰黑层级。
- 卡片、导航、浮层与输入区域要有明确但克制的明度差。
- 文本使用柔白而非绝对白，降低炫目感。
- hover、边框、分隔线使用低透明浅色，保持密集界面可读性。

预期风格：

- 用户端保留轻玻璃与氛围层次。
- 管理端强调信息结构与可扫描性。

### 页面与组件落点

#### 根布局

- `src/app/layout.tsx`
  - 接入主题 provider。
  - 确保 `Toaster` 能读取当前主题。

#### 全局样式

- `src/app/globals.css`
  - 重写 light/dark 核心 token。
  - `body` 改为使用 `var(--background)` 和 `var(--foreground)`。
  - scrollbar 同步支持深浅色。
  - 保留现有 Tailwind v4 token 映射，不新增第二套并行体系。

#### 管理端

- `src/features/admin/admin-shell.tsx`
  - 将根背景、侧栏、边框、文字替换为语义色。
  - 接入主题切换器。
- 若 `AdminHeader` 中已有适合位置，可将切换器放入头部工具区；否则先放在 `AdminShell` 顶层稳定位置。

#### 用户端

- `src/features/public/home-page.tsx`
  - 先处理首页导航、移动菜单、下拉层、Hero 关键背景与文字颜色。
  - 用语义 class 或基于 token 的透明色替换写死的白底/黑字。
  - 将主题切换器放入顶部导航，桌面与移动端都可操作。

#### 共享组件

- `src/components/ui/sonner.tsx`
  - 确保 toast 跟随主题。
- 其他已使用语义 token 的 shadcn 组件原则上无需大改，只需验证表现。

## 边界与实现原则

- 不创建用户端/管理端各自独立的主题上下文。
- 不在 route handler、服务端仓储或鉴权逻辑中引入主题相关代码。
- 不为本次需求引入新的设计系统层；继续沿用现有 token 命名。
- 页面局部若仍需半透明颜色，应优先从当前前景/背景 token 派生，而不是继续硬编码白黑值。

## 风险与缓解

### 风险 1：浅色硬编码遗漏导致夜间出现亮色孤岛

缓解：

- 优先覆盖根布局、导航、管理壳层、弹层、移动菜单、Hero 关键区域。
- 用 `rg` 搜索 `bg-white`、`text-[#1d1d1f]`、`border-black` 等高风险写法做集中检查。

### 风险 2：hydration 或首次渲染闪烁

缓解：

- 使用 `next-themes` 官方推荐方式在根布局统一接入。
- 主题切换器在客户端渲染时处理 mounted 状态，避免首屏错误图标或文案。

### 风险 3：管理端密集信息在 dark 模式下对比不足

缓解：

- 管理壳层采用更清晰的 surface 层级。
- 验证表格、导航、badge、输入框在 dark 下的边界可读性。

## 验证策略

- 代码安全基线：
  - `pnpm validate`
- 构建与主题接线检查：
  - `pnpm build`
- 浏览器验证：
  - 用户端首页验证 `light / dark / system` 三态切换、刷新持久化、移动菜单与下拉层显示。
  - 管理端验证控制台壳层、导航、头部、主要卡片与表单在三态下显示正常。
- 若本地认证或数据条件阻碍管理端浏览器验证，需要明确记录阻塞原因。

## 实施顺序

1. 接入全局 ThemeProvider 与切换组件骨架。
2. 重写全局 light/dark token 与 `body`、scrollbar 语义样式。
3. 改造管理端壳层为语义色并接入切换器。
4. 改造用户端首页导航、移动菜单、下拉层与关键 Hero 区域。
5. 校验 toast 和共享组件主题联动。
6. 运行验证并记录结果。
