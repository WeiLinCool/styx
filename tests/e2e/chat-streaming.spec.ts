import { expect, test } from '@playwright/test';

test('development-authenticated user can open chat and submit a prompt', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.locator('body')).toContainText(/AI对话|开始对话/);

  const input = page.getByPlaceholder('输入消息...');
  await expect(input).toBeVisible();
  await input.fill('请为石头印画设计一句标题');
  await page.getByRole('button').filter({ has: page.locator('svg') }).last().click();

  await expect(page.locator('body')).toContainText('请为石头印画设计一句标题');
  await expect(page.locator('body')).toContainText(/Development response from|AI 回复|模型：/);
});

test('chat page keeps recent conversation summary after a submitted prompt', async ({ page }) => {
  await page.goto('/chat');

  const prompt = `闭环测试 ${Date.now()}`;
  await page.getByPlaceholder('输入消息...').fill(prompt);
  await page.getByRole('button').filter({ has: page.locator('svg') }).last().click();

  await expect(page.locator('aside')).toContainText(prompt.slice(0, 8));
});

