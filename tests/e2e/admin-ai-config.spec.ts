import { expect, test } from '@playwright/test';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.getByLabel('账号').fill('admin');
  await page.getByLabel('密码').fill('secret-123');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.waitForURL(/\/admin$/);
}

test('admin ai config route shows login gate or configuration surface', async ({ page }) => {
  await page.goto('/admin/ai-models');
  await expect(page.locator('body')).toContainText(
    /AI 模型|账号密码进入管理端|资产管理控制台需要独立、完整、可审计的登录验证/,
  );
});

test('admin login page exposes the admin login form', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.locator('body')).toContainText(/管理端登录/);
  await expect(page.getByLabel('账号')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  await expect(page.getByRole('button', { name: '进入管理端' })).toBeVisible();
});

test('authenticated admin can open ai config surface and see key controls', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/ai-models');

  await expect(page.getByRole('button', { name: '新增供应商' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增模型' })).toBeVisible();
  await expect(page.locator('body')).toContainText(/AI 模型/);
  await expect(page.getByRole('button', { name: '测试供应商' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '测试模型' }).first()).toBeVisible();
});

test('authenticated admin can create provider and model from ai config page', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const providerCode = `pw-provider-${suffix}`;
  const providerName = `Playwright Provider ${suffix}`;
  const modelCode = `pw-model-${suffix}`;
  const modelName = `Playwright Model ${suffix}`;

  await loginAsAdmin(page);
  await page.goto('/admin/ai-models');

  await page.getByRole('button', { name: '新增供应商' }).click();
  await page.getByRole('dialog').getByLabel('Code').fill(providerCode);
  await page.getByRole('dialog').getByLabel('名称').fill(providerName);
  await page.getByRole('dialog').getByLabel('Base URL').fill('https://api.invalid.example/v1');
  await page.getByRole('dialog').getByLabel('Credential Env Key').fill('TEST_PROVIDER_SECRET');
  await page.getByRole('dialog').getByRole('button', { name: '保存供应商' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();

  await expect(page.locator('body')).toContainText(providerCode);

  await page.getByRole('button', { name: '新增模型' }).click();
  await page.getByRole('dialog').getByLabel('供应商').click();
  await page.getByRole('option', { name: providerName }).click();
  await page.getByRole('dialog').getByLabel('Code').fill(modelCode);
  await page.getByRole('dialog').getByLabel('名称').fill(modelName);
  await page.getByRole('dialog').getByLabel('上游模型名').fill('playwright-model');
  await page.getByRole('dialog').getByRole('button', { name: '保存模型' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();

  await expect(page.locator('body')).toContainText(modelCode);
  await expect(page.locator('body')).toContainText(modelName);
});

test('authenticated admin can open provider and model test dialogs', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/ai-models');

  await page.getByRole('button', { name: '测试供应商' }).first().click();
  await expect(page.getByRole('dialog')).toContainText(/测试供应商/);
  await page.getByRole('dialog').getByRole('button', { name: '开始测试' }).click();
  await expect(page.getByRole('dialog')).toContainText(/测试失败|测试请求已提交/);
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();

  await page.getByRole('button', { name: '测试模型' }).first().click();
  await expect(page.getByRole('dialog')).toContainText(/测试模型/);
  await page.getByRole('dialog').getByRole('button', { name: '开始测试' }).click();
  await expect(page.getByRole('dialog')).toContainText(/测试失败|测试请求已提交/);
});

test('authenticated admin can edit provider and model and see updated list values', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const providerCode = `pw-edit-provider-${suffix}`;
  const providerName = `Playwright Edit Provider ${suffix}`;
  const providerNameUpdated = `Playwright Edit Provider Updated ${suffix}`;
  const modelCode = `pw-edit-model-${suffix}`;
  const modelName = `Playwright Edit Model ${suffix}`;
  const modelNameUpdated = `Playwright Edit Model Updated ${suffix}`;

  await loginAsAdmin(page);
  await page.goto('/admin/ai-models');

  await page.getByRole('button', { name: '新增供应商' }).click();
  await page.getByRole('dialog').getByLabel('Code').fill(providerCode);
  await page.getByRole('dialog').getByLabel('名称').fill(providerName);
  await page.getByRole('dialog').getByLabel('Base URL').fill('https://api.invalid.example/v1');
  await page.getByRole('dialog').getByLabel('Credential Env Key').fill('TEST_PROVIDER_SECRET');
  await page.getByRole('dialog').getByRole('button', { name: '保存供应商' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();

  await page.getByRole('button', { name: '新增模型' }).click();
  await page.getByRole('dialog').getByLabel('供应商').click();
  await page.getByRole('option', { name: providerName }).click();
  await page.getByRole('dialog').getByLabel('Code').fill(modelCode);
  await page.getByRole('dialog').getByLabel('名称').fill(modelName);
  await page.getByRole('dialog').getByLabel('上游模型名').fill('playwright-model-edit');
  await page.getByRole('dialog').getByRole('button', { name: '保存模型' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();

  const providerRow = page.getByRole('row').filter({ hasText: providerCode }).first();
  await providerRow.getByRole('button', { name: '编辑' }).click();
  await page.getByRole('dialog').getByLabel('名称').fill(providerNameUpdated);
  await page.getByRole('dialog').getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('body')).toContainText(providerNameUpdated);

  const modelRow = page.getByRole('row').filter({ hasText: modelCode }).first();
  await modelRow.getByRole('button', { name: '编辑' }).click();
  await page.getByRole('dialog').getByLabel('名称').fill(modelNameUpdated);
  await page.getByRole('dialog').getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('body')).toContainText(modelNameUpdated);
});
