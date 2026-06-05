'use server';

import { redirect } from 'next/navigation';

import {
  buildOAuthErrorRedirect,
  EnterpriseOAuthError,
  issueEnterpriseAuthorizationCode,
  validateAuthorizeRequest,
} from '@/server/enterprise/oauth';

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
    redirectUrl = buildAuthorizeFailureRedirect(formData, error);
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
    throw new EnterpriseOAuthError('invalid_request', `${name} is required.`);
  }
  return value.trim();
}

function buildAuthorizeFailureRedirect(formData: FormData, error: unknown) {
  const oauthError =
    error instanceof EnterpriseOAuthError
      ? error
      : new EnterpriseOAuthError('access_denied', 'Authorization failed.', 403);
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
    error: oauthError.message,
  });
  return `/oauth/authorize?${params.toString()}`;
}
