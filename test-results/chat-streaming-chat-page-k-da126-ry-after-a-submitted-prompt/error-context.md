# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-streaming.spec.ts >> chat page keeps recent conversation summary after a submitted prompt
- Location: tests/e2e/chat-streaming.spec.ts:16:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4000/chat
Call log:
  - navigating to "http://127.0.0.1:4000/chat", waiting until "load"

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
  9  |   await input.fill('请为石头印画设计一句标题');
  10 |   await page.getByRole('button').filter({ has: page.locator('svg') }).last().click();
  11 | 
  12 |   await expect(page.locator('body')).toContainText('请为石头印画设计一句标题');
  13 |   await expect(page.locator('body')).toContainText(/Development response from|AI 回复|模型：/);
  14 | });
  15 | 
  16 | test('chat page keeps recent conversation summary after a submitted prompt', async ({ page }) => {
> 17 |   await page.goto('/chat');
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4000/chat
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