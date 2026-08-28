import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { MemberTabParamList } from '../../app/navigation/types';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../../store/authStore';
import { memberIdFromSession } from '../../utils/session';
import { fetchAttendance, fetchMemberProfile } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatDate, formatINR, daysUntil } from '../../utils/format';
import {
  requestNotificationPermission,
  scheduleRenewalReminders,
} from '../../services/notifications/notifications';

type Props = BottomTabScreenProps<MemberTabParamList, 'MemberHomeTab'>;

export function MemberHomeScreen({ navigation }: Props) {
  const session = useAuthStore((s) => s.session);
  const memberId = memberIdFromSession(session);
  const firstName = session?.user.name.split(' ')[0] ?? 'there';

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: queryKeys.memberProfile(memberId ?? 'none'),
    queryFn: () => fetchMemberProfile(memberId!),
    enabled: !!memberId,
  });

  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: queryKeys.attendance(memberId ?? 'none'),
    queryFn: () => fetchAttendance(memberId!),
    enabled: !!memberId,
  });

  // PRD §10: request permission once and (re)schedule renewal reminder pushes.
  // Scheduling is idempotent per membership end date — old ones are cancelled
  // first, so re-mounts and renewals don't stack duplicates.
  const activeMembership = profile?.membership;
  useEffect(() => {
    if (!memberId || !activeMembership?.endDate) return;
    let cancelled = false;
    requestNotificationPermission().then((granted) => {
      if (granted && !cancelled && activeMembership.endDate) {
        scheduleRenewalReminders({
          memberId,
          memberName: session?.user.name ?? 'there',
          endDate: activeMembership.endDate,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [memberId, activeMembership?.endDate, session?.user.name]);

  if (profileLoading || attLoading || !memberId) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}><Spinner /></View>
      </Screen>
    );
  }
  if (!profile || !attendance) {
    return <EmptyState icon="cloud-offline-outline" title="Couldn't load your membership" />;
  }

  const membership = profile.membership;
  const daysLeft = membership ? daysUntil(membership.endDate) : null;
  const checkedInToday = profile.member.lastCheckInAt
    ? new Date(profile.member.lastCheckInAt).toDateString() === new Date().toDateString()
    : false;

  return (
    <Screen title={`Hi, ${firstName} 👋`} subtitle="Your fitness, in one place">
      <Card style={styles.membershipCard}>
        <View style={styles.membershipHeader}>
          <View>
            <Text style={styles.membershipPlan}>{membership?.planName ?? 'No membership'}</Text>
            <Text style={styles.gymName}>Iron Forge Fitness</Text>
          </View>
          <View style={styles.membershipLogo}>
            <Ionicons name="barbell" size={20} color={colors.white} />
          </View>
        </View>
        <View style={styles.membershipRow}>
          <View style={styles.membershipStat}>
            <Text style={styles.membershipStatLabel}>Member since</Text>
            <Text style={styles.membershipStatValue}>{membership ? formatDate(membership.startDate) : '—'}</Text>
          </View>
          <View style={styles.membershipDivider} />
          <View style={styles.membershipStat}>
            <Text style={styles.membershipStatLabel}>Expires</Text>
            <Text style={styles.membershipStatValue}>{membership ? formatDate(membership.endDate) : '—'}</Text>
          </View>
          <View style={styles.membershipDivider} />
          <View style={styles.membershipStat}>
            <Text style={styles.membershipStatLabel}>Fee</Text>
            <Text style={styles.membershipStatValue}>{membership ? formatINR(membership.price) : '—'}</Text>
          </View>
        </View>
      </Card>

      {membership && daysLeft !== null ? (
        <Card muted padded style={styles.renewalCard}>
          <View style={styles.renewalRow}>
            <Ionicons name="calendar-outline" size={18} color={daysLeft <= 7 ? colors.warning : colors.success} />
            <Text style={styles.renewalText}>
              {daysLeft < 0
                ? 'Your membership has expired — renew to keep working out.'
                : daysLeft <= 7
                  ? `Your membership expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew soon!`
                  : `Membership active · expires in ${daysLeft} days`}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card style={styles.streakCard}>
        <View style={styles.streakLeft}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <View>
            <Text style={styles.streakValue}>{attendance.currentStreak} Day Streak</Text>
            <Text style={styles.streakSub}>
              {checkedInToday ? 'Checked in today — keep it going!' : 'Check in today to keep your streak alive'}
            </Text>
          </View>
        </View>
        <Button
          title={checkedInToday ? 'Checked in ✓' : 'Check in now'}
          size="sm"
          variant={checkedInToday ? 'success' : 'primary'}
          disabled={checkedInToday}
          onPress={() => navigation.navigate('CheckInTab')}
        />
      </Card>

      <View style={styles.statsRow}>
        <Pressable onPress={() => navigation.navigate('ProgressTab')} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
          <Text style={styles.statValue}>{attendance.thisMonth}</Text>
          <Text style={styles.statLabel}>Check-ins this month</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ProgressTab')} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
          <Text style={styles.statValue}>{attendance.attendanceRate}%</Text>
          <Text style={styles.statLabel}>Attendance rate</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ProgressTab')} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
          <Text style={styles.statValue}>{attendance.bestStreak}</Text>
          <Text style={styles.statLabel}>Best streak</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  membershipCard: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
    marginBottom: spacing.md,
  },
  membershipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  membershipPlan: { ...typography.heading, color: colors.white },
  gymName: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  membershipLogo: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipRow: { flexDirection: 'row', marginTop: spacing.lg },
  membershipStat: { flex: 1 },
  membershipStatLabel: { ...typography.small, color: 'rgba(255,255,255,0.75)' },
  membershipStatValue: { ...typography.captionStrong, color: colors.white, marginTop: 2 },
  membershipDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: spacing.sm },
  renewalCard: { marginBottom: spacing.md },
  renewalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  renewalText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  streakEmoji: { fontSize: 28 },
  streakValue: { ...typography.bodyStrong, color: colors.text },
  streakSub: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
  },
  pressed: { opacity: 0.9 },
  statValue: { ...typography.heading, color: colors.text },
  statLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
});
