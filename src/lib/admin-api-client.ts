import { createApiClient, type ApiClientOptions, type UserApiClient } from './user-api-client';

export type AdminApiClient = UserApiClient;

export function createAdminApiClient(options: ApiClientOptions = {}): AdminApiClient {
  return createApiClient('admin', { ...options, dedupeGetRequests: false });
}

const defaultAdminApiClient = createAdminApiClient();

export function adminApiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return defaultAdminApiClient.request(input, init);
}
