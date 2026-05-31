# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-streaming.spec.ts >> development-authenticated user can open chat and submit a prompt
- Location: tests/e2e/chat-streaming.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder('输入消息...')
    - locator resolved to <input disabled value="" placeholder="输入消息..." data-inspector-line="408" data-inspector-column="12" data-inspector-relative-path="src/app/chat/page.tsx" class="flex-1 rounded-xl border border-black/8 bg-white/[0.03] px-4 py-2.5 text-sm text-[#1d1d1f] placeholder-[#6e6e73] outline-none transition-colors focus:border-black/10"/>
    - fill("请为石头印画设计一句标题")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not enabled
    - retrying fill action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and editable
      - element is not enabled
    - retrying fill action
      - waiting 100ms
    59 × waiting for element to be visible, enabled and editable
       - element is not enabled
     - retrying fill action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - generic [ref=e10]:
      - text: Compiling
      - generic [ref=e11]:
        - generic [ref=e12]: .
        - generic [ref=e13]: .
        - generic [ref=e14]: .
  - alert [ref=e15]
  - generic [ref=e16]:
    - complementary [ref=e17]:
      - generic [ref=e18]:
        - link "AI对话" [ref=e19] [cursor=pointer]:
          - /url: /home
          - img [ref=e21]
          - generic [ref=e24]: AI对话
        - button [ref=e25] [cursor=pointer]:
          - img [ref=e26]
      - button "+ 新对话" [ref=e30]
    - generic [ref=e31]:
      - banner [ref=e32]:
        - generic [ref=e33]:
          - link "返回" [ref=e34] [cursor=pointer]:
            - /url: /home
            - img [ref=e35]
            - generic [ref=e37]: 返回
          - generic [ref=e38]: AI对话
        - button "登录" [ref=e40] [cursor=pointer]
      - generic [ref=e42]:
        - img [ref=e44]
        - heading "开始对话" [level=2] [ref=e47]
        - paragraph [ref=e48]: 向AI助手提问石头印画创作和AI视频工作流
        - generic [ref=e49]:
          - button "帮我设计一个石头印画作品" [ref=e50] [cursor=pointer]:
            - img [ref=e51]
            - text: 帮我设计一个石头印画作品
          - button "写一段AI视频生成提示词" [ref=e53] [cursor=pointer]:
            - img [ref=e54]
            - text: 写一段AI视频生成提示词
          - button "生成石头印画分镜脚本" [ref=e57] [cursor=pointer]:
            - img [ref=e58]
            - text: 生成石头印画分镜脚本
          - button "如何用AI做短视频获客？" [ref=e63] [cursor=pointer]:
            - img [ref=e64]
            - text: 如何用AI做短视频获客？
      - generic [ref=e67]:
        - generic [ref=e68]:
          - generic [ref=e69]: 聊天模型
          - combobox "聊天模型" [disabled] [ref=e70]:
            - option "无可用模型" [selected]
        - generic [ref=e71]:
          - textbox "输入消息..." [disabled] [ref=e72]
          - button [disabled] [ref=e73] [cursor=pointer]:
            - img [ref=e74]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('development-authenticated user can open chat and submit a prompt', async ({ page }) => {
  4  |   await page.goto('/chat');
  5  |   await expect(page.locator('body')).toContainText(/AI对话|开始对话/);
  6  | 
  7  |   const input = page.getByPlaceholder('输入消息...');
  8  |   await expect(input).toBeVisible();
> 9  |   await input.fill('请为石头印画设计一句标题');
     |               ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  10 |   await page.getByRole('button').filter({ has: page.locator('svg') }).last().click();
  11 | 
  12 |   await expect(page.locator('body')).toContainText('请为石头印画设计一句标题');
  13 |   await expect(page.locator('body')).toContainText(/Development response from|AI 回复|模型：/);
  14 | });
  15 | 
  16 | test('chat page keeps recent conversation summary after a submitted prompt', async ({ page }) => {
  17 |   await page.goto('/chat');
  18 | 
  19 |   const prompt = `闭环测试 ${Date.now()}`;
  20 |   await page.getByPlaceholder('输入消息...').fill(prompt);
  21 |   await page.getByRole('button').filter({ has: page.locator('svg') }).last().click();
  22 | 
  23 |   await expect(page.locator('aside')).toContainText(prompt.slice(0, 8));
  24 | });
  25 | 
  26 | 
```