## MODIFIED Requirements

### Requirement: Admin Work-Order Queue Management
管理端 SHALL 在用户页展示并处理多类人工工单，包括激活绑定工单和密码重置工单，并使用统一的队列生命周期。

#### Scenario: Support reviews password reset work orders
- **WHEN** 管理员打开 `/admin/users`
- **THEN** 页面展示密码重置工单队列，并支持 `待处理`、`处理中`、`已办结`、`已归档` 状态筛选、计数和分页

#### Scenario: Support approves password reset handling
- **WHEN** 管理员在处理中队列中办结一个密码重置工单
- **THEN** 系统生成临时密码、将工单标记为 `closed`、记录处理时间，并允许客服在后台查看该临时密码以通知用户

#### Scenario: Support archives a closed password reset work order
- **WHEN** 管理员归档一个已办结的密码重置工单
- **THEN** 系统将该工单移动到 `archived` 队列并保留历史记录
