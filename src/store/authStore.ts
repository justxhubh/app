// Auth state — Zustand (PRD §15 responsibilities).

import { create } from 'zustand';
import type { AuthSession } from '../types';
import * as endpoints from '../services/api/endpoints';
import { setAuthToken } from '../services/api/client';
import {
  clearStoredSession,
  getStoredSession,
  saveSession,
} from '../services/auth/tokenStorage';

type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'unauthenticated';

interface AuthState {
  session: AuthSession | null;
  status: AuthStatus;
  restore: () => Promise<void>;
  sendOtp: (phone: string) => Promise<string>;
  login: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (session: AuthSession) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  status: 'idle',

  restore: async () => {
    set({ status: 'restoring' });
    try {
      const stored = await getStoredSession();
      if (!stored) {
        set({ status: 'unauthenticated' });
        return;
      }
      const session = JSON.parse(stored.sessionJson) as AuthSession;
      setAuthToken(session.accessToken);
      set({ session, status: 'authenticated' });
    } catch {
      await clearStoredSession();
      set({ status: 'unauthenticated' });
    }
  },

  sendOtp: async (phone: string) => {
    const res = await endpoints.sendOtp(phone);
    return res.otp;
  },

  login: async (phone: string, otp: string) => {
    const session = await endpoints.verifyOtp(phone, otp);
    get().setSession(session);
  },

  setSession: async (session: AuthSession) => {
    setAuthToken(session.accessToken);
    set({ session, status: 'authenticated' });
    await saveSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      sessionJson: JSON.stringify(session),
    });
  },

  logout: async () => {
    try {
      await endpoints.logout();
    } catch {
      // ignore network errors on logout
    }
    setAuthToken(null);
    set({ session: null, status: 'unauthenticated' });
    await clearStoredSession();
  },
}));

export const isOwner = (s: AuthSession | null) => s?.user.role === 'OWNER';
export const isMember = (s: AuthSession | null) => s?.user.role === 'MEMBER';
