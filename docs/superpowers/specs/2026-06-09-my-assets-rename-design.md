# 我的资料重命名设计

日期：2026-06-09

## 背景

当前 `我的资料` 页面支持查看、搜索、预览、下载、分享和删除已保存到云端的媒体资产，但不支持修改资产标题。用户保存的资料同时包含两类来源：

- AI 生成后保存到资料库的资产
- 本地上传到资料库的资产

这两类资料在持久化层已经共享同一张 `generated_media_assets` 表，并统一使用 `title` 作为展示名称。因此重命名能力应建立在统一资产标题更新之上，而不是按来源拆分两套逻辑。

## 目标

- 在 `我的资料` 页面允许用户重命名自己的媒体资产。
- AI 生成资料与本地上传资料使用完全一致的重命名流程。
- 重命名仅修改展示标题，不修改对象存储路径、文件内容、分享标识或来源元数据。

## 非目标

- 不在 `用户中心` 页面新增重命名入口。
- 不支持批量重命名。
- 不调整上传时的标题生成策略。
- 不修改历史分享链接、下载链接或对象 key。

## 当前结构

- 页面：`src/features/public/my-assets-page.tsx`
- 列表接口：`GET /api/user/media-assets`
- 单资产接口：`GET/DELETE /api/user/media-assets/[assetId]`
- 持久化：`src/server/repositories/generated-media-assets.ts`
- 资产标题来源：`generated_media_assets.title`

## 状态与边界

### 可变状态

- 资产标题 `generated_media_assets.title`

### 所有者

- 持久化真相由 `generated_media_assets` repository 持有。
- UI 只持有列表与预览中的临时展示状态。

### 写入口

- `PATCH /api/user/media-assets/[assetId]`

### 数据边界

- 页面负责触发编辑、展示保存中和错误状态。
- 路由负责认证、参数校验和错误翻译。
- repository 负责按 `assetId + userId` 限定更新范围。

## 约束与不变量

1. 只有资产所有者可以修改该资产标题。
2. 重命名只影响 `title` 和 `updatedAt`，不影响 `objectKey`、`shareId`、`sourceType`、`originalFilename`。
3. 已删除或非 `ready` 状态资产不可重命名。

## 方案对比

### 方案 A：卡片内联编辑

优点：

- 操作路径最短。

缺点：

- 当前卡片动作已经密集，移动端更容易拥挤。
- 内联输入会和预览、下载、分享、删除并列，易产生误触和状态冲突。

### 方案 B：预览弹窗中编辑标题

优点：

- 复用已有预览 `Dialog`，改动面最小。
- 移动端空间充足，标题编辑状态更清晰。
- 修改后可同步更新弹窗标题和卡片标题。

缺点：

- 需要先进入预览再编辑。

### 选型

采用方案 B。当前页面已经存在成熟的预览弹窗，标题本身就在弹窗头部展示，把重命名能力放到这里可以最小化布局风险，并保持桌面端与移动端的一致性。

## 设计

### API

在 `src/app/api/user/media-assets/[assetId]/route.ts` 新增 `PATCH`：

- 请求体：`{ title: string }`
- 校验：
  - `title` 必填
  - `title.trim()` 后长度至少 1
  - 长度上限设置为 100 个字符
- 行为：
  - 验证当前登录用户
  - 仅允许更新该用户自己拥有、且未删除、状态为 `ready` 的资产
  - 返回更新后的资产 DTO

错误语义：

- 400：标题为空或超长
- 404：资产不存在，或不属于当前用户，或不可编辑

### Repository

在 `GeneratedMediaAssetRepository` 增加：

- `updateSavedAssetTitleForUser(assetId: string, userId: string, title: string): Promise<GeneratedMediaAssetDto | null>`

数据库实现与内存实现都需要遵守相同过滤条件：

- `id = assetId`
- `userId = current user`
- `status = ready`
- `deletedAt is null`

更新字段：

- `title`
- `updatedAt`

### UI

在 `src/features/public/my-assets-page.tsx` 的预览弹窗中增加标题编辑能力：

- 默认展示标题与“重命名”按钮
- 进入编辑态后显示输入框、保存、取消
- 保存中禁用重复提交
- 保存成功后：
  - 更新 `assets`
  - 更新 `previewAsset`
  - 清除编辑态
  - 展示成功提示
- 保存失败后保留编辑内容并展示错误提示

### 本地状态策略

- 不重新拉取整个列表，直接用返回的最新 asset 更新本地数组
- 如果当前预览的正是被改名资产，同步替换 `previewAsset`
- 搜索和筛选继续基于更新后的 `title`

## 交互细节

- 输入框初始值为当前标题
- 保存前对输入执行 `trim()`
- 若新标题与旧标题一致，则直接退出编辑态，不发送请求
- 取消恢复只读态，不修改标题
- 预览弹窗关闭时清理标题编辑状态，避免下次打开残留

## 测试与验证

### 自动化

- 为 repository 增加重命名测试：
  - owner 可更新标题
  - 非 owner 不可更新
  - 已删除资产不可更新
  - 更新不影响 `objectKey` / `shareId` / `originalFilename`
- 为 `src/app/api/user/media-assets/[assetId]/route.ts` 增加 `PATCH` 路由测试：
  - 成功更新
  - 空标题失败
  - 超长标题失败
  - 资产不存在失败

### 手工验证

- 登录后进入 `我的资料`
- 对 AI 生成资产重命名并确认卡片、预览标题、搜索结果同步更新
- 对本地上传资产重命名并确认行为一致
- 验证下载、分享、删除在改名后仍正常

## 风险

- 预览弹窗新增编辑态后，需避免与现有下载按钮、关闭动作发生状态残留。
- 标题长度上限需要在 UI 和 API 之间保持一致，避免前后端提示不一致。

## 本地设计结论

采用“`我的资料` 预览弹窗内重命名 + 单资产 `PATCH` 接口 + repository 统一更新标题”的最小实现路径，以最低改动支持 AI 生成资料与本地上传资料的统一重命名能力。
