import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateAuthorizeRequest, type EnterpriseAuthorizeRequest } from '@/server/enterprise/oauth';
import { authorizeEnterprise } from './actions';

type AuthorizePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const OAUTH_PARAM_FIELDS: Array<{
  formName: string;
  requestKey: keyof EnterpriseAuthorizeRequest;
  value: (request: EnterpriseAuthorizeRequest) => string;
}> = [
  { formName: 'response_type', requestKey: 'responseType', value: () => 'code' },
  { formName: 'client_id', requestKey: 'clientId', value: (request) => request.clientId },
  { formName: 'redirect_uri', requestKey: 'redirectUri', value: (request) => request.redirectUri },
  {
    formName: 'code_challenge',
    requestKey: 'codeChallenge',
    value: (request) => request.codeChallenge,
  },
  {
    formName: 'code_challenge_method',
    requestKey: 'codeChallengeMethod',
    value: (request) => request.codeChallengeMethod,
  },
  { formName: 'state', requestKey: 'state', value: (request) => request.state },
  { formName: 'scope', requestKey: 'scope', value: (request) => request.scope },
];

export default async function EnterpriseAuthorizePage({ searchParams }: AuthorizePageProps) {
  const rawParams = searchParams ? await searchParams : {};
  const localError =
    firstParam(rawParams.error_description) ??
    formatOAuthErrorCode(firstParam(rawParams.error)) ??
    null;
  let authorizeRequest: EnterpriseAuthorizeRequest | null = null;
  let authorizeError: string | null = localError || null;

  try {
    authorizeRequest = validateAuthorizeRequest(toUrlSearchParams(rawParams));
  } catch (error) {
    authorizeError = error instanceof Error ? error.message : 'OAuth 授权请求无效。';
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">太极台授权登录</h1>
            <p className="text-sm text-muted-foreground">使用你的账号完成 SSO 登录并连接桌面客户端。</p>
          </div>
        </div>

        {!authorizeRequest ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {authorizeError ?? 'OAuth 授权请求无效。'}
          </div>
        ) : (
          <form action={authorizeEnterprise} className="space-y-4">
            {authorizeError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {authorizeError}
              </div>
            ) : null}

            {OAUTH_PARAM_FIELDS.map((field) => (
              <input
                key={field.requestKey}
                type="hidden"
                name={field.formName}
                value={field.value(authorizeRequest)}
              />
            ))}

            <div className="space-y-2">
              <Label htmlFor="login">账号 / 邮箱</Label>
              <Input id="login" name="login" autoComplete="username" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>

            <Button type="submit" className="w-full">
              登录并授权
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}

function toUrlSearchParams(params: Record<string, string | string[] | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const firstValue = firstParam(value);
    if (firstValue !== undefined) {
      searchParams.set(key, firstValue);
    }
  }
  return searchParams;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatOAuthErrorCode(code: string | undefined) {
  switch (code) {
    case 'invalid_request':
      return 'OAuth 请求无效。';
    case 'unauthorized_client':
      return '客户端未获授权。';
    case 'access_denied':
      return '授权失败。';
    case 'invalid_grant':
      return '授权码无效。';
    case 'invalid_token':
      return '令牌无效。';
    default:
      return code ?? null;
  }
}
