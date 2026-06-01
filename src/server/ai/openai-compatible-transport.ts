import { ProxyAgent, fetch as undiciFetch } from 'undici';

type FetchLike = typeof fetch;

export type RequestInitWithDispatcher = RequestInit & {
  dispatcher?: ProxyAgent;
};

let cachedProxyConfig: { url: string; agent: ProxyAgent } | null = null;

export function proxyRequestInit(): Pick<RequestInitWithDispatcher, 'dispatcher'> {
  const proxyUrl = process.env.STYX_OPENAI_COMPAT_PROXY_URL?.trim();
  if (!proxyUrl) {
    return {};
  }

  if (!cachedProxyConfig || cachedProxyConfig.url !== proxyUrl) {
    cachedProxyConfig = {
      url: proxyUrl,
      agent: new ProxyAgent(proxyUrl),
    };
  }

  return { dispatcher: cachedProxyConfig.agent };
}

export function selectOpenAiCompatibleFetch(): FetchLike {
  return process.env.STYX_OPENAI_COMPAT_PROXY_URL?.trim()
    ? (undiciFetch as unknown as FetchLike)
    : fetch;
}
