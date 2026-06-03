# Admin Membership Versioned Config Design

Date: 2026-06-03

## Goal

落地管理端会员权益配置能力，并将会员方案、权益规则、权限绑定统一收敛到可运营的版本化工作台中；同时为该模块补齐与 AI 模型模块一致的新手导航说明。

本次设计解决两个核心问题：

1. 管理端当前只有会员概览页和独立的权限绑定页，缺少可直接维护会员商业配置的完整工作流。
2. 会员配置不能“保存即覆盖存量用户”。已生效用户必须保留当前周期所购买的历史版本；只有新开通和续费用户才进入新版本。

## Scope

In scope:

- 将 `/admin/memberships` 升级为会员方案版本化配置工作台。
- 支持会员方案基础信息、价格、权益规则、权限绑定的草稿编辑。
- 支持立即发布和预定生效两种发布方式。
- 为当前用户 entitlement 固化当时生效的会员版本，保证历史版本隔离。
- 将现有会员方案权限绑定能力迁入会员工作台。
- 在会员模块页头增加 `AdminModuleGuide` 新手导航。

Out of scope:

- 通用 RBAC 平台设计。
- benefit code、手动用户 grant、deny 规则等复杂授权模型扩展。
- 对已生效 entitlement 的强制回收或按后台保存实时覆写。
- 自动账单重试、自动续费扣款、支付网关集成。
- 通用版本回滚引擎；v1 只支持“从历史版本复制为新草稿后再发布”。

## Current State

当前仓库已有以下基础：

- `src/app/admin/(console)/memberships/page.tsx`：会员方案概览和会员订阅工单列表。
- `src/app/admin/(console)/permissions/page.tsx`：会员方案与权限资源绑定的独立编辑页。
- `src/features/admin/admin-module-guide.tsx`：AI 模型模块已复用的新手导航组件。
- `src/server/db/schema.ts` 中已有 `membership_plans`、`benefits`、`user_entitlements`、`permission_resources`、`membership_plan_permission_bindings`。
- 会员状态展示和用户权限解析当前都基于有效 `user_entitlements` 推导。

当前缺口：

- 会员方案与权益规则不可直接维护。
- 权限绑定没有纳入会员版本语义。
- 会员配置变更没有“历史版本保留”机制。
- 管理端没有清晰说明“配置变更何时影响用户”的新手导航。

## Research Summary

Industry consensus:

- 订阅型商品目录通常采用“稳定商品主档 + 版本化商业配置”的模式。
- 用户实际持有记录会固化成交时版本，避免后台改配置污染已售权益。
- 新版本发布默认只影响未来成交、开通或续费，不覆盖当前有效周期中的存量用户。

Transferable principle:

- 目录配置与用户持有状态分离。
- 版本发布影响未来生效，不回写当前有效持有。
- 历史版本必须可审计、可查看、可复制，但不应允许直接随意覆写。

Repository constraints:

- 当前 durable truth 在 `user_entitlements`，不能引入第二套用户侧会员真相。
- 权限资源目录和权限解析已经存在，应复用而不是另起体系。
- 管理端是 operational surface，需要保持密集、可扫描、可审计。

Local design:

- 保留 `membership_plans` 作为稳定主档。
- 引入版本表和版本内子表保存价格、权益、权限绑定。
- 在 `user_entitlements` 上固化 `planVersionId`，让已生效用户保持历史版本。

## State Ownership

| State | Owner | Write Entry | Source of Truth |
| --- | --- | --- | --- |
| 会员方案稳定身份（code、排序、激活状态） | membership catalog domain | admin membership mutation routes | `membership_plans` |
| 会员商业配置版本（价格、文案、权益、权限） | membership version domain | draft save / publish / schedule routes | `membership_plan_versions` + child tables |
| 用户已生效会员持有记录 | membership / subscription approval domain | subscription approval / renewal entry | `user_entitlements` |
| 权限资源目录 | permission resource domain | existing sync + admin read model | `permission_resources` |
| 预定生效中的下一版本 | membership version domain | publish scheduler mutation | `membership_plan_versions.status = scheduled` |

## Invariants

1. `user_entitlements` 一旦生效，必须绑定一个明确的会员版本；该 entitlement 在有效期内不受后台新版本编辑影响。
2. 同一会员方案任一时刻最多只有一个当前已发布版本，最多只有一个未来待生效版本。
3. 新开通和续费必须解析“该时刻应生效的版本”，不能简单取最近编辑内容。

## Data Model

### Keep `membership_plans` as stable catalog

保留现有 `membership_plans` 作为稳定主档，仅承载跨版本稳定身份：

- `id`
- `code`
- `name`
- `sortOrder`
- `isActive`
- 轻量 `metadata`

当前直接放在 `membership_plans` 上的价格、描述、周期等可版本化字段将迁移到版本表；如兼容窗口内需保留旧列，则以版本表为 authoritative source。

### New `membership_plan_versions`

用途：保存某个会员方案的一版完整商业配置。

建议字段：

- `id`
- `planId`
- `versionNumber`
- `status`: `draft | scheduled | published | archived`
- `effectiveFrom`
- `publishedAt`
- `displayName`
- `description`
- `billingPeriod`
- `priceCents`
- `currency`
- `changeSummary`
- `createdBy`
- `publishedBy`
- `metadata`
- `createdAt`
- `updatedAt`

约束：

- `(planId, versionNumber)` 唯一。
- 每个 `planId` 最多一个 `draft`。
- 每个 `planId` 最多一个 `scheduled`。
- 发布版本必须有 `publishedAt`；预定版本必须有 `effectiveFrom`。

### New `membership_plan_version_benefits`

用途：保存某一版本内的权益规则明细。

建议字段：

- `id`
- `versionId`
- `code`
- `name`
- `kind`
- `quantity`
- `unit`
- `metadata`
- `createdAt`
- `updatedAt`

约束：

- `(versionId, code)` 唯一。
- 删除版本时级联删除该版本下权益明细。

### New `membership_plan_version_permission_bindings`

用途：保存某一版本内的权限绑定集合。

建议字段：

- `id`
- `versionId`
- `permissionResourceId`
- `createdAt`

约束：

- `(versionId, permissionResourceId)` 唯一。

### Extend `user_entitlements`

新增：

- `planVersionId` -> `membership_plan_versions.id`

规则：

- 用户通过订阅审批、续费或管理员开通会员时，必须把当时命中的版本固化到 `planVersionId`。
- `planId` 可保留用于聚合和兼容，但运行时解析价格、权限、权益时优先看 `planVersionId`。

## Lifecycle

### Draft editing

- 管理员进入某个会员方案工作区时，优先加载该方案的 `draft`；若无 draft，则允许从当前已发布版复制创建。
- 草稿可编辑：
  - 基础信息与价格
  - 权益规则
  - 权限绑定
- 保存草稿只写版本表，不影响线上已生效用户。

### Publish now

- 管理员确认发布草稿。
- 系统校验该方案没有未处理的冲突发布。
- 草稿转为新的 `published` 版本，并写入 `publishedAt`。
- 原 `published` 版本转入 `archived`。
- 新发布版本只影响发布后的新开通和后续续费。

### Schedule publish

- 管理员为草稿设置未来 `effectiveFrom`。
- 系统将其标记为 `scheduled`。
- 当到达生效时刻后，该版本成为续费和新开通的命中版本。
- 若已有 `scheduled` 版本，必须先取消、替换或覆盖，不能并存多个未来版本。

### Existing entitlements

- 已生效 entitlement 保持原 `planVersionId`，当前周期内不被新版本覆盖。
- 权益删除、权限收回、价格上调等变更都只对未来新 entitlement 生效。
- 用户续费或顺延时，新的 entitlement 绑定该时刻应生效的最新版本。

### History management

- 历史版本只读。
- 支持查看版本差异摘要。
- 支持“复制历史版本为新草稿”。
- v1 不做直接回滚覆盖；需要恢复旧配置时，通过复制历史版本生成新版本再发布。

## Runtime Resolution

### Membership snapshot

当前 `src/server/auth/membership-snapshot.ts` 仍按 plan code 推导等级快照。版本化后：

- 等级快照仍可继续从 membership plan stable code 派生。
- 到期时间继续取有效 entitlement 的 `expiresAt`。
- 若将来需要版本级显示文案，可在用户侧读取 `planVersionId` 关联的版本展示字段。

### Permission resolution

当前会员方案权限绑定是 `planId -> permission resources`。版本化后：

- entitlement permission resolution 改为 `active entitlement -> planVersionId -> version permission bindings`。
- 管理员在会员模块里编辑的权限绑定，实际落到版本绑定表。
- `/admin/permissions` 降级为权限资源总览 / 诊断页，不再作为会员绑定主编辑入口。

### Benefit / entitlement resolution

- AI entitlement 或其他需要读取会员权益的运行时逻辑，应通过 `planVersionId` 读取该 entitlement 对应版本下的权益定义。
- 对仅依赖 plan code 的旧逻辑，保留兼容路径，但新功能应逐步转向版本解析。

## Admin UX

### `/admin/memberships`

升级为会员版本化工作台：

1. 左侧方案列表
   - 展示方案名、code、当前发布版本号、下一版本状态、当前价格、生效用户数。
2. 中间版本工作区
   - 展示当前查看的是 `draft / scheduled / published / archived` 哪个版本。
   - 使用 tab 分为：
     - `基础信息与价格`
     - `权益规则`
     - `权限绑定`
3. 右侧或底部发布与历史区
   - 版本时间线
   - 当前发布状态
   - 预定生效信息
   - 历史版本查看与复制入口

### Permissions editing

- 复用现有 `AdminPermissionsModule` 的资源列表、搜索和勾选交互。
- 但其数据 owner 从 `planId` 改为 `versionId`。
- 会员工作台中的 `权限绑定` tab 成为正式编辑入口。

### Benefits editing

在 `权益规则` tab 中提供：

- 新增权益
- 编辑权益
- 删除草稿中的权益
- 显示权益类型、数量、单位和说明

### Publish confirmation

发布确认弹窗应明确提示：

- 此次变更只影响新开通和后续续费。
- 已生效用户当前周期保持历史版本。
- 价格、权益、权限增删摘要。

## Admin Module Guide

会员模块页头新增 `AdminModuleGuide`，建议文案：

- `title`
  - `第一次配置会员方案`
- `description`
  - `会员方案以版本方式管理。管理员编辑的是下一版价格、权益和权限绑定；已生效用户会保留当前周期的历史版本，只有新开通和续费才会进入新版本。`
- `steps`
  1. `先选择要维护的会员方案，确认当前发布版本、预定生效版本和正在编辑的草稿是否一致。`
  2. `在草稿中完成价格、权益规则和权限绑定调整，必要时填写本次变更说明。`
  3. `发布时选择立即生效或预定生效时间；发布后只影响新开通和后续续费，不覆盖已生效用户当期权益。`
- `risks`
  1. `删除权限或权益不会回收当前周期内已生效用户的能力，需确认下个续费周期的预期变化。`
  2. `调整价格后，续费用户将按新版本价格结算，必要时先通知运营和客服。`
  3. `同一方案同一时间只能保留一个待生效版本，避免续费结算出现版本歧义。`

## API / Repository Boundaries

### Route / server actions

新增或调整的边界应遵守：

- 管理端 API / server actions 负责验证输入、鉴权和 transport concerns。
- 会员版本业务规则放在 `src/server/repositories` 或对应 domain service。

建议能力：

- 获取会员方案工作台数据
- 创建草稿
- 保存草稿基础信息
- 保存草稿权益
- 保存草稿权限绑定
- 立即发布
- 预定发布
- 取消预定发布
- 复制历史版本为新草稿

### Repository responsibilities

建议拆分：

- `membership-plan-versions.ts`
  - 读取工作台数据
  - 草稿创建/复制
  - 发布/预定发布
  - 当前生效版本解析
- `membership-version-permissions.ts`
  - 版本权限绑定读写
- `membership-version-benefits.ts`
  - 版本权益规则读写

如实现时更适合合并为单个 `membership-plan-config.ts` repository，也应保持职责清晰，避免路由层拥有版本决策逻辑。

## Migration Strategy

1. 基于当前 `membership_plans`、`benefits`、`membership_plan_permission_bindings` 回填初始版本。
2. 为每个现有 membership plan 生成 `versionNumber = 1` 的 `published` 版本。
3. 把当前 plan 上的价格、周期、描述迁入版本表。
4. 把当前 `benefits` 迁移到对应的版本权益表。
5. 把当前 `membership_plan_permission_bindings` 迁移到对应的版本权限绑定表。
6. 为当前有效和历史 `user_entitlements` 尽可能补齐 `planVersionId`：
   - 若 entitlement 有 `planId` 且该 plan 的初始版本唯一，则回填初始版本 id。
   - 无法确定的历史脏数据要记录并提供人工检查。

## Verification

最低验证层建议：

- Schema / repository:
  - 版本状态约束
  - 同方案单 draft / single scheduled invariant
  - entitlement 绑定 planVersionId
  - 发布和预定发布解析逻辑
- Type / lint:
  - `pnpm validate`
- App wiring:
  - `pnpm build`
- Browser:
  - 管理端会员工作台草稿编辑、发布确认、预定生效展示、新手导航展开收起

重点场景：

1. 现有用户持有旧版本 entitlement 时，后台发布新版本，不影响其当前访问权限。
2. 同一用户续费后，新 entitlement 正确绑定新版本。
3. 预定版本未到时，不影响新订单；到时后，新订单和续费命中新版本。
4. 删除某项权限后，旧 entitlement 用户仍保留当前周期权限，新 entitlement 用户被收回。

## Risks

- 现有大量按 `planId` 或 `planCode` 推导权益的逻辑，需要逐步识别并迁移到 `planVersionId` 解析。
- 数据迁移若未完整回填历史 entitlement 的 `planVersionId`，会导致历史用户解析歧义。
- 若后台允许同时存在多个未来版本，会导致续费结算和权限解析不确定。

## Open Decisions Resolved

- 已生效用户不能被后台新配置即时覆盖。
- 价格、权益、权限都跟版本走。
- 支持 `draft -> immediate publish` 与 `draft -> schedule publish` 两种路径。
- 历史版本保留，并支持复制为新草稿。

## Implementation Direction

按实现顺序建议：

1. Schema + migration + backfill design
2. Repository / domain version resolution
3. Admin memberships workspace UI
4. Permission editor move into memberships workspace
5. Membership guide copy and publish UX
6. Runtime resolution updates and regression coverage
