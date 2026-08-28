// Secure token storage — PRD §14.
// Tokens are never kept in plain AsyncStorage; we use the platform
// secure store (Keychain / Keystore) via expo-secure-store.
// On web (where SecureStore is unavailable) we fall back to localStorage.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'gym_access_token';
const REFRESH_TOKEN_KEY = 'gym_refresh_token';
const SESSION_KEY = 'gym_session';

const isWeb = Platform.OS === 'web';

export async function saveSession(session: {
  accessToken: string;
  refreshToken: string;
  sessionJson: string;
}): Promise<void> {
  if (isWeb) {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(SESSION_KEY, session.sessionJson);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
  await SecureStore.setItemAsync(SESSION_KEY, session.sessionJson);
}

export async function getStoredSession(): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionJson: string;
} | null> {
  const read = isWeb
    ? (k: string) => localStorage.getItem(k)
    : (k: string) => SecureStore.getItemAsync(k);
  const accessToken = await read(ACCESS_TOKEN_KEY);
  const refreshToken = await read(REFRESH_TOKEN_KEY);
  const sessionJson = await read(SESSION_KEY);
  if (!accessToken || !refreshToken || !sessionJson) return null;
  return { accessToken, refreshToken, sessionJson };
}

export async function clearStoredSession(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
