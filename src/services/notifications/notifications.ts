// Local push notifications via expo-notifications (PRD §10, §13).
// V1 uses locally-scheduled notifications — no EAS push token infra needed.
// In-app notifications (fed by the mock server) continue to work alongside these.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Foreground behavior: show a banner even when the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const STREAK_CHANNEL = 'streak-milestones';
const RENEWAL_CHANNEL = 'renewal-reminders';

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(STREAK_CHANNEL, {
    name: 'Streak milestones',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  await Notifications.setNotificationChannelAsync(RENEWAL_CHANNEL, {
    name: 'Renewal reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await ensureChannels();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

// ---- Streak milestones (PRD §8, §13) ----

export const STREAK_MILESTONES = [7, 14, 30] as const;

export async function notifyStreakMilestone(streak: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ensureChannels();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🔥 ${streak}-day streak!`,
        body: 'Keep the momentum going — one more workout tomorrow.',
        sound: 'default',
        data: { kind: 'streak', streak },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId: STREAK_CHANNEL,
      },
    });
  } catch {
    // Notifications are best-effort; never break the check-in flow.
  }
}

// ---- Renewal reminders (PRD §10 default workflow) ----

// 7 days before expiry → reminder; 3 days before → second reminder;
// on expiry day → payment reminder.
export const RENEWAL_OFFSETS = [
  {
    days: 7,
    title: (name: string) => `💳 ${name}, your membership renews in 7 days`,
    body: (date: Date) => `Renew before ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to keep your plan active.`,
  },
  {
    days: 3,
    title: (name: string) => `💳 ${name}, your membership expires in 3 days`,
    body: (date: Date) => `Only a few days left. Renew by ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
  },
  {
    days: 0,
    title: (name: string) => `💳 ${name}, your membership expires today`,
    body: () => 'Renew today to keep working out without interruption.',
  },
] as const;

export async function scheduleRenewalReminders(opts: {
  memberId: string;
  memberName: string;
  endDate: string;
}): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    await ensureChannels();
    await cancelRenewalReminders(opts.memberId);

    const end = new Date(opts.endDate);
    const now = Date.now();
    let scheduled = 0;
    for (const { days, title, body } of RENEWAL_OFFSETS) {
      const fireAt = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      fireAt.setHours(9, 0, 0, 0); // fire at 9 AM on the reminder day
      if (fireAt.getTime() <= now) continue; // already past

      const identifier = `renewal-${opts.memberId}-${days}d`;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: title(opts.memberName),
          body: body(end),
          sound: 'default',
          data: { kind: 'renewal', memberId: opts.memberId, endDate: opts.endDate },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: RENEWAL_CHANNEL,
        },
      });
      scheduled++;
    }
    return scheduled;
  } catch {
    return 0;
  }
}

export async function cancelRenewalReminders(memberId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ids = scheduled
      .filter((n) => n.identifier.startsWith(`renewal-${memberId}-`))
      .map((n) => n.identifier);
    for (const id of ids) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {
    // ignore
  }
}
