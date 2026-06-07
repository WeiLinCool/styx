'use server';

import { redirect } from 'next/navigation';

import {
  buildOAuthErrorRedirect,
  EnterpriseOAuthError,
  issueEnterpriseAuthorizationCode,
  validateAuthorizeRequest,
} from '@/server/enterprise/oauth';
import { AccountDomainError } from '@/server/auth/account-types';

const AUTHORIZE_PARAM_NAMES = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
] as const;

export async function authorizeEnterprise(formData: FormData): Promise<never> {
  let redirectUrl: string;

  try {
    const authorizeRequest = validateAuthorizeRequest(readAuthorizeParams(formData));
    const login = readRequiredFormString(formData, 'login');
    const password = readRequiredFormString(formData, 'password');
    const result = await issueEnterpriseAuthorizationCode({
      ...authorizeRequest,
      login,
      password,
    });
    redirectUrl = result.redirectUrl;
  } catch (error) {
    redirectUrl = await buildAuthorizeFailureRedirect(formData, error);
  }

  redirect(redirectUrl);
}

function readAuthorizeParams(formData: FormData) {
  const params = new URLSearchParams();
  for (const name of AUTHORIZE_PARAM_NAMES) {
    const value = formData.get(name);
    if (typeof value === 'string') {
      params.set(name, value);
    }
  }
  return params;
}

function readRequiredFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    const label = name === 'login' ? '账号' : name === 'password' ? '密码' : name;
    throw new EnterpriseOAuthError('invalid_request', `${label} 是必填项。`);
  }
  return value.trim();
}

export async function buildAuthorizeFailureRedirect(
  formData: FormData,
  error: unknown,
) {
  if (error instanceof AccountDomainError && error.code === 'password_setup_required') {
    const passwordSetupRedirect = buildPasswordSetupRedirect(formData);
    if (passwordSetupRedirect) {
      return passwordSetupRedirect;
    }
  }

  const oauthError = toAuthorizeOAuthError(error);
  const redirectUri = formData.get('redirect_uri');
  const state = formData.get('state');

  if (typeof redirectUri === 'string' && typeof state === 'string' && state.trim()) {
    try {
      return buildOAuthErrorRedirect(redirectUri, oauthError, state);
    } catch {
      // Fall through to a local error page when the callback URI itself is unsafe.
    }
  }

  const params = new URLSearchParams({
    error: oauthError.code,
    error_description: oauthError.message,
  });
  return `/oauth/authorize?${params.toString()}`;
}

function toAuthorizeOAuthError(error: unknown) {
  if (error instanceof EnterpriseOAuthError) {
    return error;
  }

  if (error instanceof AccountDomainError) {
    return new EnterpriseOAuthError('access_denied', error.message, error.status);
  }

  return new EnterpriseOAuthError('access_denied', '授权失败。', 403);
}

function buildPasswordSetupRedirect(formData: FormData) {
  const login = formData.get('login');
  if (typeof login !== 'string' || !login.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    login: login.trim(),
  });
  return `/auth/set-password?${params.toString()}`;
}
