// API client.
//
// Two transports, same interface:
//  - If EXPO_PUBLIC_API_URL is set, requests go over HTTP to the real
//    FastAPI/Postgres backend (bearer auth, automatic token refresh on 401).
//  - Otherwise requests hit the in-memory mock server, which keeps the app
//    fully functional for demos without a backend.
//
// The endpoint functions in ./endpoints.ts and all screens are unaware of
// which transport is active.

import { handleRequest } from './mock/server';
import { getStoredSession, saveSession } from '../auth/tokenStorage';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

let currentToken: string | null = null;
let simulateOffline = false;
let refreshing = false;

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

// Demo helper: force the backend to behave like the device is offline,
// so the offline check-in queue (PRD §20) can be exercised.
export function setSimulateOffline(v: boolean): void {
  simulateOffline = v;
}

export function isOfflineSimulated(): boolean {
  return simulateOffline;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return String((detail[0] as Record<string, unknown>)?.msg ?? 'Request failed');
  }
  return `Request failed (${status})`;
}

// Refresh the session once using the stored refresh token, then retry.
async function tryRefresh(): Promise<boolean> {
  if (refreshing) return false;
  refreshing = true;
  try {
    const stored = await getStoredSession();
    if (!stored?.refreshToken) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    });
    if (!res.ok) return false;
    const session = (await res.json()) as {
      user: unknown;
      gym: unknown;
      accessToken: string;
      refreshToken: string;
    };
    currentToken = session.accessToken;
    await saveSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      sessionJson: JSON.stringify(session),
    });
    return true;
  } catch {
    return false;
  } finally {
    refreshing = false;
  }
}

async function httpFetch<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) {
    res = await doFetch();
  }
  if (!res.ok) {
    const body = await readBody(res);
    throw new ApiError(res.status, errorMessage(body, res.status));
  }
  return (await res.json()) as T;
}

export async function apiFetch<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (simulateOffline) {
    await new Promise((r) => setTimeout(r, 300));
    throw new Error('Network request failed — you are offline');
  }
  if (API_BASE) {
    return httpFetch<T>(method, path, body);
  }
  const res = (await handleRequest(method, path, body, {
    token: currentToken,
  })) as T;
  return res;
}

export const get = <T>(path: string, query?: Record<string, string | number | undefined>) => {
  const qs = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<T>('GET', `${path}${suffix}`);
};

export const post = <T>(path: string, body?: Record<string, unknown>) =>
  apiFetch<T>('POST', path, body);

export const patch = <T>(path: string, body?: Record<string, unknown>) =>
  apiFetch<T>('PATCH', path, body);

export const del = <T>(path: string, body?: Record<string, unknown>) =>
  apiFetch<T>('DELETE', path, body);
