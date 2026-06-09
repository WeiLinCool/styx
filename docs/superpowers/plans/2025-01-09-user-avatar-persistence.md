# 用户头像持久化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户头像从仅存储在cookie改为持久化到数据库，确保所有页面显示用户真实配置的头像。

**Architecture:** 
- 数据库层：使用已存在的 `users.avatarUrl` 字段存储头像URL
- API层：新增 `/api/user/profile` endpoint 处理profile更新，修复 `/api/auth/me` 返回正确的avatar
- Repository层：添加 `updateUserProfile` 方法
- 前端层：修改AuthContext调用API持久化更改，修改用户中心上传逻辑

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, PostgreSQL, React Context

---

## 文件结构

### 新增文件
- `src/app/api/user/profile/route.ts` - 用户profile更新API endpoint
- `src/app/api/user/profile/route.test.ts` - API集成测试

### 修改文件
- `src/server/repositories/users.ts` - 添加 `updateUserProfile` 方法
- `src/app/api/auth/me/route.ts:80` - 修复avatar返回逻辑
- `src/lib/auth-context.tsx` - 修改 `updateUser` 调用API
- `src/app/user-center/page.tsx:261-270` - 修改头像上传调用API
- `src/lib/cookie.ts` - (可选) UserInfo类型保持不变

---

## Task 1: 添加Repository方法 - updateUserProfile

**Files:**
- Modify: `src/server/repositories/users.ts`

- [ ] **Step 1: 添加updateUserProfile方法**

在 `src/server/repositories/users.ts` 文件末尾添加：

```typescript
/**
 * Update user profile fields (displayName, avatarUrl)
 * @param userId - User ID
 * @param input - Profile fields to update
 * @returns Updated user record
 * @throws AccountDomainError if user not found
 */
export async function updateUserProfile(
  userId: string,
  input: {
    displayName?: string;
    avatarUrl?: string | null;
  }
): Promise<typeof schema.users.$inferSelect> {
  const database = requireDb();
  
  const updateData: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  };
  
  if (input.displayName !== undefined) {
    updateData.displayName = input.displayName;
  }
  
  if (input.avatarUrl !== undefined) {
    updateData.avatarUrl = input.avatarUrl;
  }
  
  const [user] = await database
    .update(schema.users)
    .set(updateData)
    .where(eq(schema.users.id, userId))
    .returning();
  
  if (!user) {
    throw new AccountDomainError('account_not_found', 'Account not found.', 404);
  }
  
  return user;
}
```

确保文件顶部已导入 `eq`：
```typescript
import { eq } from 'drizzle-orm';
```

- [ ] **Step 2: 导出新方法**

在文件末尾的导出部分，确保 `updateUserProfile` 已被导出（如果有导出列表的话）。

- [ ] **Step 3: 验证类型安全**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

---

## Task 2: 创建 /api/user/profile API endpoint

**Files:**
- Create: `src/app/api/user/profile/route.ts`
- Create: `src/app/api/user/profile/route.test.ts`

- [ ] **Step 1: 创建API route文件**

创建 `src/app/api/user/profile/route.ts`：

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/server/auth/middleware';
import { updateUserProfile } from '@/server/repositories/users';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().or(z.string().startsWith('data:')).nullable().optional(),
});

/**
 * PUT /api/user/profile
 * Update user profile (displayName, avatarUrl)
 * 
 * Request body:
 * {
 *   displayName?: string,
 *   avatarUrl?: string | null
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   user: {
 *     id: string,
 *     displayName: string,
 *     avatarUrl: string | null,
 *     ...
 *   }
 * }
 */
export async function PUT(request: Request) {
  try {
    const context = await requireAuth();
    
    const body = await request.json();
    const validated = updateProfileSchema.parse(body);
    
    // 至少需要一个字段
    if (!validated.displayName && validated.avatarUrl === undefined) {
      return NextResponse.json(
        { error: 'At least one field (displayName or avatarUrl) must be provided' },
        { status: 400 }
      );
    }
    
    const updatedUser = await updateUserProfile(context.user.id, validated);
    
    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        displayName: updatedUser.displayName,
        avatarUrl: updatedUser.avatarUrl,
        email: updatedUser.email,
        phone: updatedUser.phone,
      },
    });
  } catch (error) {
    console.error('Failed to update user profile:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 创建集成测试文件**

创建 `src/app/api/user/profile/route.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PUT } from './route';
import { NextRequest } from 'next/server';

describe('PUT /api/user/profile', () => {
  it('should update displayName', async () => {
    // 测试更新displayName
  });
  
  it('should update avatarUrl with data URL', async () => {
    // 测试更新avatarUrl为data: URL
  });
  
  it('should update avatarUrl with remote URL', async () => {
    // 测试更新avatarUrl为远程URL
  });
  
  it('should allow setting avatarUrl to null', async () => {
    // 测试设置avatarUrl为null（删除头像）
  });
  
  it('should reject invalid avatarUrl', async () => {
    // 测试拒绝无效的avatarUrl
  });
  
  it('should return 401 for unauthenticated user', async () => {
    // 测试未认证用户
  });
  
  it('should return 400 if no fields provided', async () => {
    // 测试没有提供任何字段
  });
});

// TODO: 根据项目的测试工具设置实现具体的测试用例
```

- [ ] **Step 3: 验证API route编译**

运行: `pnpm build`
预期: 构建成功，无类型错误

---

## Task 3: 修复 /api/auth/me 返回正确的avatar

**Files:**
- Modify: `src/app/api/auth/me/route.ts:80`

- [ ] **Step 1: 找到当前的avatar返回逻辑**

运行: `grep -n "avatar:" src/app/api/auth/me/route.ts`
预期: 找到第80行左右的avatar字段赋值

- [ ] **Step 2: 修复avatar返回逻辑**

修改 `src/app/api/auth/me/route.ts` 中的avatar返回逻辑：

**当前代码（第80行左右）：**
```typescript
avatar: session.user.phone ?? session.user.email ?? session.user.displayName,
```

**修改为：**
```typescript
avatar: session.user.avatarUrl || 
        session.user.phone || 
        session.user.email || 
        session.user.displayName,
```

**完整上下文（约75-85行）：**
```typescript
return NextResponse.json({
  success: true,
  user: {
    id: session.user.id,
    displayName: session.user.displayName,
    email: session.user.email,
    phone: session.user.phone,
    avatar: session.user.avatarUrl || 
            session.user.phone || 
            session.user.email || 
            session.user.displayName, // 修改这里
    accountState: session.user.accountState,
    activatedAt: session.user.activatedAt,
    storageQuotaBytes: Number(session.user.storageQuotaBytes),
    storageUsedBytes: Number(session.user.storageUsedBytes),
    createdAt: session.user.createdAt,
    updatedAt: session.user.updatedAt,
  },
});
```

- [ ] **Step 3: 验证修改**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

---

## Task 4: 修改前端AuthContext调用API

**Files:**
- Modify: `src/lib/auth-context.tsx`

- [ ] **Step 1: 找到updateUser方法**

运行: `grep -n "const updateUser" src/lib/auth-context.tsx`
预期: 找到updateUser方法定义

- [ ] **Step 2: 修改updateUser方法调用API**

找到 `src/lib/auth-context.tsx` 中的 `updateUser` 方法，修改为：

**当前逻辑（约第X行）：**
```typescript
const updateUser = useCallback((updates: Partial<UserInfo>) => {
  setUser((prev) => {
    if (!prev) return null;
    const updated = { ...prev, ...updates };
    setUserInfoCookie(updated);
    return updated;
  });
}, []);
```

**修改为：**
```typescript
const updateUser = useCallback(async (updates: Partial<UserInfo>) => {
  // 乐观更新：立即更新本地状态
  setUser((prev) => {
    if (!prev) return null;
    const updated = { ...prev, ...updates };
    setUserInfoCookie(updated);
    return updated;
  });

  // 持久化到服务器
  try {
    const response = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: updates.nickname,
        avatarUrl: updates.avatar,
      }),
    });

    if (!response.ok) {
      // 如果失败，回滚到服务器状态
      console.error('Failed to update profile:', await response.text());
      // 可选：刷新用户信息
      // await refreshUser();
      return;
    }

    const data = await response.json();
    // 使用服务器返回的最新状态更新本地
    setUser((prev) => {
      if (!prev) return null;
      const serverUpdated: UserInfo = {
        ...prev,
        nickname: data.user.displayName,
        avatar: data.user.avatarUrl || prev.avatar,
      };
      setUserInfoCookie(serverUpdated);
      return serverUpdated;
    });
  } catch (error) {
    console.error('Failed to persist profile update:', error);
  }
}, []);
```

- [ ] **Step 3: 更新UserInfo类型定义（如需要）**

检查 `src/lib/cookie.ts` 中的 UserInfo 类型：

```typescript
export interface UserInfo {
  id: string;
  nickname: string;  // 对应数据库的displayName
  avatar: string;     // 对应数据库的avatarUrl
  email: string;
  phone: string;
  accountState: string;
  activatedAt: string | null;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  createdAt: string;
  updatedAt: string;
}
```

确认类型定义正确，无需修改。

- [ ] **Step 4: 验证类型安全**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

---

## Task 5: 修改用户中心头像上传逻辑

**Files:**
- Modify: `src/app/user-center/page.tsx:261-270`

- [ ] **Step 1: 找到头像上传处理函数**

运行: `grep -n "handleAvatarUpload" src/app/user-center/page.tsx`
预期: 找到第261行左右的handleAvatarUpload函数

- [ ] **Step 2: 修改头像上传逻辑**

找到 `src/app/user-center/page.tsx` 中的 `handleAvatarUpload` 函数：

**当前代码（约第261-270行）：**
```typescript
const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target?.result as string;
    updateUser({ avatar: dataUrl }); // 只更新本地状态
  };
  reader.readAsDataURL(file);
};
```

**修改为：**
```typescript
const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    toast.error('请选择图片文件');
    return;
  }
  
  // 验证文件大小（例如最大 5MB）
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    toast.error('图片大小不能超过 5MB');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target?.result as string;
    // 调用updateUser，会同时更新本地状态和持久化到服务器
    await updateUser({ avatar: dataUrl });
  };
  reader.onerror = () => {
    toast.error('读取图片失败');
  };
  reader.readAsDataURL(file);
};
```

- [ ] **Step 3: 确保toast已导入**

检查文件顶部是否已导入toast：

```typescript
import { toast } from 'sonner';
```

如果没有，添加导入。

- [ ] **Step 4: 验证修改**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

---

## Task 6: 修改注册流程保存头像

**Files:**
- Modify: `src/lib/auth-context.tsx:148`

- [ ] **Step 1: 找到注册成功后的处理逻辑**

运行: `grep -n "avatarUrl || avatarSeed" src/lib/auth-context.tsx`
预期: 找到第148行左右的注册后处理

- [ ] **Step 2: 修改注册流程保存头像**

找到注册成功后的处理逻辑（约第148行）：

**当前代码：**
```typescript
onLogin({
  ...payload.user,
  avatar: avatarUrl || avatarSeed || payload.user.avatar,
});
```

**修改为：**
```typescript
onLogin({
  ...payload.user,
  avatar: avatarUrl || avatarSeed || payload.user.avatar,
});

// 如果注册时选择了头像，持久化到服务器
if (avatarUrl && payload.user) {
  try {
    await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl }),
    });
  } catch (error) {
    console.error('Failed to save avatar during registration:', error);
    // 不阻塞注册流程
  }
}
```

**完整上下文：**
```typescript
// 注册/登录成功后
const handleAuthSuccess = async (payload: LoginResponse, avatarUrl?: string, avatarSeed?: string) => {
  onLogin({
    ...payload.user,
    avatar: avatarUrl || avatarSeed || payload.user.avatar,
  });

  // 如果是新注册且选择了头像，持久化到服务器
  if (avatarUrl && payload.isNewUser) {
    try {
      await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl }),
      });
    } catch (error) {
      console.error('Failed to save avatar during registration:', error);
    }
  }
};
```

- [ ] **Step 3: 验证类型安全**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

---

## Task 7: 端到端测试验证

**Files:**
- 无新文件

- [ ] **Step 1: 运行类型检查**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

- [ ] **Step 2: 运行构建**

运行: `pnpm build`
预期: 构建成功

- [ ] **Step 3: 运行现有测试**

运行: `pnpm test`
预期: 所有测试通过

- [ ] **Step 4: 启动开发服务器**

运行: `pnpm dev`
预期: 开发服务器启动成功

- [ ] **Step 5: 手动测试头像上传流程**

测试步骤：
1. 登录用户账户
2. 进入用户中心页面
3. 上传一张头像图片
4. 刷新页面，验证头像仍然存在
5. 检查数据库 `users` 表的 `avatarUrl` 字段是否有值
6. 退出登录，重新登录，验证头像仍然显示
7. 检查 `/api/auth/me` 返回的avatar字段是否正确

- [ ] **Step 6: 手动测试注册流程（如果支持注册）**

测试步骤：
1. 注册新用户
2. 在注册过程中选择一个头像
3. 注册成功后，检查数据库 `users` 表的 `avatarUrl` 字段是否有值
4. 刷新页面，验证头像仍然显示

- [ ] **Step 7: 提交代码**

```bash
git add src/server/repositories/users.ts \
        src/app/api/user/profile/route.ts \
        src/app/api/user/profile/route.test.ts \
        src/app/api/auth/me/route.ts \
        src/lib/auth-context.tsx \
        src/app/user-center/page.tsx

git commit -m "feat: persist user avatar to database

- Add updateUserProfile repository method
- Create /api/user/profile endpoint for profile updates
- Fix /api/auth/me to return avatarUrl
- Update AuthContext to persist profile changes via API
- Update user center avatar upload to call API
- Save avatar during registration flow

Closes: user avatar persistence issue"
```

---

## 验收标准

- [ ] 用户可以上传头像并持久化到数据库
- [ ] 刷新页面后头像仍然显示
- [ ] 退出重新登录后头像仍然显示
- [ ] 所有页面都显示用户的真实头像（从数据库读取）
- [ ] 数据库 `users.avatarUrl` 字段正确存储头像URL
- [ ] `/api/auth/me` 返回正确的avatar字段
- [ ] 类型检查通过
- [ ] 构建成功
- [ ] 现有测试通过

---

## 风险和注意事项

1. **向后兼容性**：
   - 现有用户的 `avatarUrl` 字段为 null，会继续使用 fallback 逻辑
   - 修改是渐进式的，不会破坏现有功能

2. **性能考虑**：
   - 头像以 data URL 形式存储可能较大（最大5MB）
   - 后续可考虑改为存储到对象存储服务（如S3）
   - 当前方案适用于MVP阶段

3. **安全考虑**：
   - API验证avatarUrl格式（必须是URL或data:开头）
   - 防止恶意URL注入
   - 文件大小限制（5MB）

4. **错误处理**：
   - API调用失败时保留本地更新，不阻塞用户操作
   - 控制台记录错误日志
   - 可选的回滚机制

5. **测试覆盖**：
   - 集成测试文件已创建，但需要根据项目测试工具实现具体用例
   - 建议后续补充完整的单元测试和集成测试