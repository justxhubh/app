// Offline check-in queue — PRD §20.
// Pending check-ins are stored locally and synced when the network returns.

import { create } from 'zustand';
import type { PendingCheckIn } from '../types';
import { submitCheckIn } from '../services/api/endpoints';

interface CheckInState {
  pending: PendingCheckIn[];
  lastResult: { streak: number; message: string; memberName: string } | null;
  queueOffline: (item: Omit<PendingCheckIn, 'localId' | 'syncStatus'>) => void;
  syncPending: () => Promise<number>;
  clearResult: () => void;
}

let localCounter = 0;

export const useCheckInStore = create<CheckInState>((set, get) => ({
  pending: [],
  lastResult: null,

  queueOffline: (item) => {
    const entry: PendingCheckIn = {
      ...item,
      localId: `pending-${Date.now()}-${localCounter++}`,
      syncStatus: 'PENDING',
    };
    set((s) => ({ pending: [...s.pending, entry] }));
  },

  syncPending: async () => {
    const pending = get().pending;
    if (pending.length === 0) return 0;
    let synced = 0;
    const remaining: PendingCheckIn[] = [];
    for (const item of pending) {
      try {
        await submitCheckIn({
          memberId: item.memberId,
          source: 'OFFLINE',
          qrPayload: item.qrPayload,
        });
        synced++;
      } catch {
        remaining.push({ ...item, syncStatus: 'FAILED' });
      }
    }
    set({ pending: remaining });
    return synced;
  },

  clearResult: () => set({ lastResult: null }),
}));
