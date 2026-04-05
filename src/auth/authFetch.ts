import { getAccessToken } from './keycloak';

export async function authFetch(input: RequestInfo | URL | string | undefined, init: RequestInit = {}): Promise<Response> {
  if (!input) {
    throw new Error('Request URL is not configured.');
  }

  const token = await getAccessToken();
  const headers = new Headers(init.headers ?? {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers
  });
}
