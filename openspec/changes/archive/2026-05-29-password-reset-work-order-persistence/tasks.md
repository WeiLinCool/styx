## 1. Public Password Authentication

- [x] 1.1 修复用户登录接口，要求手机号 + 密码严格校验，禁止任意密码登录。
- [x] 1.2 为未设置密码的历史账号返回明确错误，并引导到首次设置密码页面。

## 2. Password Setup And Reset

- [x] 2.1 新增首次设置密码页面与独立接口。
- [x] 2.2 新增忘记密码工单申请页与 API。
- [x] 2.3 新增强制重置正式密码页面，并在临时密码登录后自动跳转。

## 3. Admin Work-Order Operations

- [x] 3.1 在管理端用户页复用工单队列展示密码重置工单。
- [x] 3.2 新增密码重置工单的处理中、办结生成临时密码、归档动作。

## 4. Persistence

- [x] 4.1 将密码重置工单从内存存储改为数据库持久化。
- [x] 4.2 新增数据库 schema 与 migration。

## 5. Verification

- [x] 5.1 运行 TypeScript 校验。
- [x] 5.2 运行针对改动文件的 eslint 校验。
- [x] 5.3 执行数据库迁移并确认完成。
