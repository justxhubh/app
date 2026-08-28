import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { NotificationItem } from '../../types';
import { fetchNotifications, markNotificationRead } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatDateTime } from '../../utils/format';

const KIND_META: Record<NotificationItem['kind'], { emoji: string; color: string; bg: string }> = {
  risk: { emoji: '🔴', color: colors.danger, bg: colors.dangerLight },
  renewal: { emoji: '💳', color: colors.warning, bg: colors.warningLight },
  payment: { emoji: '🚨', color: colors.critical, bg: colors.criticalLight },
  revenue: { emoji: '💰', color: colors.brand, bg: colors.brandLight },
  streak: { emoji: '🔥', color: colors.success, bg: colors.successLight },
  milestone: { emoji: '🏆', color: colors.success, bg: colors.successLight },
};

export function NotificationsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: fetchNotifications,
  });

  const markRead = (item: NotificationItem) => {
    if (item.read) return;
    markNotificationRead(item.id).then(() => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
    });
  };

  return (
    <Screen title="Notifications" refreshing={isRefetching} onRefresh={refetch}>
      {isLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load notifications" />
      ) : data!.notifications.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="No notifications yet" subtitle="Actions like reminders and renewals will appear here." />
      ) : (
        data!.notifications.map((n) => {
          const meta = KIND_META[n.kind];
          return (
            <Pressable
              key={n.id}
              onPress={() => markRead(n)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: n.read ? colors.surface : meta.bg },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.emojiWrap}>
                <Text style={styles.emoji}>{meta.emoji}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[styles.title, n.read && styles.read]}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
                <Text style={styles.time}>{formatDateTime(n.createdAt)}</Text>
              </View>
              {!n.read ? <View style={[styles.unread, { backgroundColor: meta.color }]} /> : null}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.9 },
  emojiWrap: { width: 36, alignItems: 'center' },
  emoji: { fontSize: 20 },
  info: { flex: 1 },
  title: { ...typography.captionStrong, color: colors.text },
  body: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  time: { ...typography.small, color: colors.textMuted, marginTop: 4 },
  read: { color: colors.textSecondary },
  unread: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
