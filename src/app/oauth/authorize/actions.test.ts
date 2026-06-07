import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountDomainError } from '@/server/auth/account-types';
import { EnterpriseOAuthError } from '@/server/enterprise/oauth';

import { buildAuthorizeFailureRedirect } from './actions';

function createAuthorizeFormData() {
  const formData = new FormData();
  formData.set('redirect_uri', 'http://127.0.0.1:49152/callback');
  formData.set('state', 'state-1');
  formData.set('login', '13800138000');
  return formData;
}

test('buildAuthorizeFailureRedirect sends password setup failures to the recovery page', async () => {
  const redirectUrl = await buildAuthorizeFailureRedirect(
    createAuthorizeFormData(),
    new AccountDomainError('password_setup_required', '当前账号尚未设置密码，请先设置密码后再登录。', 403),
  );

  assert.equal(redirectUrl, '/auth/set-password?login=13800138000');
});

test('buildAuthorizeFailureRedirect preserves other account-domain failure messages', async () => {
  const redirectUrl = await buildAuthorizeFailureRedirect(
    createAuthorizeFormData(),
    new AccountDomainError('session_required', '账号或密码错误。', 401),
  );

  const url = new URL(redirectUrl);
  assert.equal(url.origin + url.pathname, 'http://127.0.0.1:49152/callback');
  assert.equal(url.searchParams.get('error'), 'access_denied');
  assert.equal(url.searchParams.get('error_description'), '账号或密码错误。');
  assert.equal(url.searchParams.get('state'), 'state-1');
});

test('buildAuthorizeFailureRedirect preserves OAuth error codes and descriptions', async () => {
  const redirectUrl = await buildAuthorizeFailureRedirect(
    createAuthorizeFormData(),
    new EnterpriseOAuthError('invalid_request', 'client_id 是必填项。', 400),
  );

  const url = new URL(redirectUrl);
  assert.equal(url.searchParams.get('error'), 'invalid_request');
  assert.equal(url.searchParams.get('error_description'), 'client_id 是必填项。');
});

test('buildAuthorizeFailureRedirect falls back to a generic denial for unexpected errors', async () => {
  const redirectUrl = await buildAuthorizeFailureRedirect(
    createAuthorizeFormData(),
    new Error('boom'),
  );

  const url = new URL(redirectUrl);
  assert.equal(url.searchParams.get('error'), 'access_denied');
  assert.equal(url.searchParams.get('error_description'), '授权失败。');
});
