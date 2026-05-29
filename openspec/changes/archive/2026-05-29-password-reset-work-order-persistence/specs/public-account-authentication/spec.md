## MODIFIED Requirements

### Requirement: Password-Based User Sign-In
系统 SHALL 对用户登录执行严格的手机号和密码校验，不允许仅凭手机号建立会话。

#### Scenario: User provides wrong password
- **WHEN** 已注册用户提交错误密码登录
- **THEN** 系统返回认证失败，不创建登录会话

#### Scenario: User has never set a password
- **WHEN** 历史账号尚未设置密码且尝试登录
- **THEN** 系统返回“需要先设置密码”的错误，并引导用户进入首次设置密码流程

### Requirement: First-Time Password Setup And Forced Reset
系统 SHALL 区分首次设置密码与临时密码后的强制重置密码流程。

#### Scenario: User sets password for the first time
- **WHEN** 未设置密码用户打开首次设置密码页面并提交合法新密码
- **THEN** 系统保存密码 hash，并允许该账号后续使用密码登录

#### Scenario: User signs in with temporary password
- **WHEN** 用户使用客服提供的临时密码登录成功
- **THEN** 系统标记该用户必须立即重置正式密码，并将前端导航到重置密码页面

#### Scenario: User completes forced password reset
- **WHEN** 用户在强制重置页面提交合法新密码
- **THEN** 系统更新密码 hash，清除必须重置标记，并要求用户后续使用新的正式密码登录
