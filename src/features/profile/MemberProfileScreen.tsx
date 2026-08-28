import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { memberIdFromSession } from '../../utils/session';
import { fetchMemberProfile } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatDate, formatINR } from '../../utils/format';

export function MemberProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const memberId = memberIdFromSession(session);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.memberProfile(memberId ?? 'none'),
    queryFn: () => fetchMemberProfile(memberId!),
    enabled: !!memberId,
  });

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout();
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <Screen title="Profile" scroll={false}>
        <View style={styles.loading}><Spinner /></View>
      </Screen>
    );
  }
  if (isError || !data) {
    return (
      <Screen title="Profile">
        <EmptyState icon="cloud-offline-outline" title="Couldn't load your profile" />
      </Screen>
    );
  }

  const { member, membership } = data;

  return (
    <Screen title="Profile">
      <Card style={styles.profileCard}>
        <Avatar name={member.name} size={64} />
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{member.name}</Text>
          <Text style={styles.phone}>+91 {member.phone}</Text>
          <View style={styles.badgeRow}>
            <Badge label="Member" color={colors.brand} bg={colors.brandLight} />
            {membership?.status === 'ACTIVE' ? (
              <Badge label="Active" color={colors.success} bg={colors.successLight} />
            ) : null}
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Membership</Text>
      <Card>
        <SettingRow label="Plan" value={membership?.planName ?? '—'} />
        <SettingRow label="Started" value={membership ? formatDate(membership.startDate) : '—'} />
        <SettingRow label="Expires" value={membership ? formatDate(membership.endDate) : '—'} />
        <SettingRow label="Monthly fee" value={membership ? formatINR(membership.price) : '—'} last />
      </Card>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <Card>
        <ToggleRow
          icon="notifications-outline"
          label="Push notifications"
          sub="Streak updates, renewal reminders"
          value={pushEnabled}
          onChange={setPushEnabled}
        />
        <ToggleRow
          icon="alarm-outline"
          label="Renewal reminders"
          sub="7, 3 and 0 days before expiry"
          value={remindersEnabled}
          onChange={setRemindersEnabled}
        />
      </Card>

      <View style={styles.spacer} />
      <Button
        title="Log out"
        variant="danger"
        fullWidth
        loading={loggingOut}
        icon={<Ionicons name="log-out-outline" size={16} color={colors.white} />}
        onPress={confirmLogout}
      />
    </Screen>
  );
}

function SettingRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

function ToggleRow({
  icon,
  label,
  sub,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand }} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.xl },
  profileInfo: { flex: 1 },
  name: { ...typography.title, color: colors.text },
  phone: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.md },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  settingLabel: { ...typography.caption, color: colors.textSecondary },
  settingValue: { ...typography.captionStrong, color: colors.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { ...typography.captionStrong, color: colors.text },
  toggleSub: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  spacer: { height: spacing.xxl },
});
