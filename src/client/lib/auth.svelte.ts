import { api, setUnauthorizedHandler } from './api.ts';

interface MeResponse {
  authenticated: boolean;
}

export const auth = $state<{ status: 'unknown' | 'in' | 'out' }>({ status: 'unknown' });

// An expired login sends the presenter back to the login page (see App.svelte).
setUnauthorizedHandler(() => {
  auth.status = 'out';
});

export async function refreshAuth(): Promise<void> {
  try {
    const me = await api<MeResponse>('GET', '/api/admin/me');
    auth.status = me.authenticated ? 'in' : 'out';
  } catch {
    auth.status = 'out';
  }
}

export async function login(password: string): Promise<void> {
  await api<MeResponse>('POST', '/api/admin/login', { password });
  auth.status = 'in';
}

export async function logout(): Promise<void> {
  await api<MeResponse>('POST', '/api/admin/logout');
  auth.status = 'out';
}
