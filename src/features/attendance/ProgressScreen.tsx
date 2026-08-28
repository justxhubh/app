import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { ProgressRing } from '../../components/ProgressRing';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { memberIdFromSession } from '../../utils/session';
import { fetchAttendance } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { addDays } from '../../utils/format';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MILESTONES = [
  { label: '7-day streak', emoji: '🔥', target: 7 },
  { label: '14-day streak', emoji: '⚡', target: 14 },
  { label: '30-day streak', emoji: '🌟', target: 30 },
  { label: '50 check-ins', emoji: '🎯', target: 50 },
  { label: '100 check-ins', emoji: '🏆', target: 100 },
];

export function ProgressScreen() {
  const session = useAuthStore((s) => s.session);
  const memberId = memberIdFromSession(session);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.attendance(memberId ?? 'none'),
    queryFn: () => fetchAttendance(memberId!),
    enabled: !!memberId,
  });

  if (isLoading) {
    return (
      <Screen title="Your Attendance" scroll={false}>
        <View style={styles.loading}><Spinner /></View>
      </Screen>
    );
  }
  if (isError || !data) {
    return (
      <Screen title="Your Attendance">
        <EmptyState icon="cloud-offline-outline" title="Couldn't load your progress" />
      </Screen>
    );
  }

  const last7: boolean[] = [];
  for (let d = 6; d >= 0; d--) {
    const key = addDays(new Date().toISOString(), -d).slice(0, 10);
    last7.push(!!data.last30Days[key]);
  }

  const totalCheckIns = Object.values(data.last30Days).filter(Boolean).length;

  return (
    <Screen title="Your Attendance" subtitle="Track your consistency" refreshing={isRefetching} onRefresh={refetch}>
      <Card style={styles.heroCard}>
        <ProgressRing
          progress={data.attendanceRate}
          color={data.attendanceRate >= 70 ? colors.success : data.attendanceRate >= 40 ? colors.warning : colors.danger}
          label={`${data.currentStreak}d`}
          sublabel="current streak"
        />
        <View style={styles.heroStats}>
          <HeroStat value={`${data.currentStreak}`} label="Day streak" />
          <HeroStat value={`${data.thisMonth}`} label="This month" />
          <HeroStat value={`${data.attendanceRate}%`} label="Attendance" />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>This week</Text>
      <Card>
        <View style={styles.weekRow}>
          {last7.map((v, i) => (
            <View key={i} style={styles.dayCol}>
              <View style={[styles.dayCircle, v ? styles.dayDone : styles.dayMiss]}>
                {v ? <Text style={styles.dayCheck}>✓</Text> : null}
              </View>
              <Text style={[styles.dayLabel, v && styles.dayLabelDone]}>{DAY_LABELS[i]}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.weekNote}>
          {data.currentStreak > 0
            ? `You're on a ${data.currentStreak}-day streak. Keep it up! 🔥`
            : 'Check in today to start a new streak.'}
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Milestones</Text>
      <Card>
        {MILESTONES.map((m, i) => {
          const achieved =
            m.target <= 30 ? data.currentStreak >= m.target : totalCheckIns >= m.target;
          const progress =
            m.target <= 30
              ? Math.min(100, (data.currentStreak / m.target) * 100)
              : Math.min(100, (totalCheckIns / m.target) * 100);
          return (
            <View key={m.label} style={[styles.milestoneRow, i > 0 && styles.milestoneBorder]}>
              <Text style={styles.milestoneEmoji}>{m.emoji}</Text>
              <View style={styles.milestoneInfo}>
                <Text style={styles.milestoneLabel}>{m.label}</Text>
                <View style={styles.milestoneTrack}>
                  <View style={[styles.milestoneFill, { width: `${progress}%` }, achieved && styles.milestoneFillDone]} />
                </View>
              </View>
              <Text style={[styles.milestoneStatus, { color: achieved ? colors.success : colors.textMuted }]}>
                {achieved ? 'Done ✓' : `${m.target > 30 ? totalCheckIns : data.currentStreak}/${m.target}`}
              </Text>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.heroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginBottom: spacing.xl },
  heroStats: { flex: 1, gap: spacing.lg },
  heroStat: { alignItems: 'center' },
  heroValue: { ...typography.title, color: colors.text },
  heroLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.md, marginTop: spacing.xs },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 6 },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDone: { backgroundColor: colors.success },
  dayMiss: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  dayCheck: { color: colors.white, fontWeight: '700' },
  dayLabel: { ...typography.small, color: colors.textMuted },
  dayLabelDone: { color: colors.success, fontWeight: '700' },
  weekNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.lg },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  milestoneBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  milestoneEmoji: { fontSize: 18 },
  milestoneInfo: { flex: 1 },
  milestoneLabel: { ...typography.captionStrong, color: colors.text },
  milestoneTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, marginTop: 6, overflow: 'hidden' },
  milestoneFill: { height: '100%', borderRadius: 3, backgroundColor: colors.brand },
  milestoneFillDone: { backgroundColor: colors.success },
  milestoneStatus: { ...typography.captionStrong, fontSize: 12 },
});
