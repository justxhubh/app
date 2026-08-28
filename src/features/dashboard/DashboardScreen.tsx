import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { KpiCard } from '../../components/KpiCard';
import { Card } from '../../components/Card';
import { SectionHeader } from '../../components/SectionHeader';
import { RiskBadge } from '../../components/RiskBadge';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import { fetchDashboardSummary, sendReminder } from '../../services/api/endpoints';
import { formatINR, formatCompactINR, daysUntil } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { queryKeys } from '../../store/queryKeys';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <View style={styles.chart}>
      {data.map((v, i) => (
        <View key={i} style={styles.chartCol}>
          <View style={styles.chartBarTrack}>
            <View
              style={[
                styles.chartBar,
                { height: `${Math.max(8, (v / max) * 100)}%`, backgroundColor: v > 0 ? colors.brand : colors.border },
              ]}
            />
          </View>
          <Text style={styles.chartDay}>{days[i]}</Text>
          <Text style={styles.chartVal}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function DashboardScreen() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.session);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: fetchDashboardSummary,
  });

  const remind = async (membershipId: string) => {
    await sendReminder(membershipId);
    qc.invalidateQueries({ queryKey: queryKeys.notifications });
  };

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}><Spinner /></View>
      </Screen>
    );
  }
  if (isError || !data) {
    return (
      <Screen title={greeting()} subtitle="Your gym overview">
        <EmptyState icon="cloud-offline-outline" title="Couldn't load your dashboard" subtitle="Pull to refresh to retry." />
      </Screen>
    );
  }

  const d = data;
  const riskedTotal = d.atRiskCount + d.criticalCount;
  const firstName = session?.user.name.split(' ')[0] ?? 'Owner';

  return (
    <Screen
      scroll
      refreshing={isRefetching}
      onRefresh={refetch}
      headerRight={
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Settings" testID="settings-gear" onPress={() => nav.navigate('Settings')} hitSlop={8} style={styles.bellWrap}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable accessibilityLabel="Notifications" testID="notifications-bell" onPress={() => nav.navigate('Notifications')} hitSlop={8} style={styles.bellWrap}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {d.renewalsOverdue > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>
      }
    >
      <Text style={styles.greeting}>{greeting()}, {firstName} 👋</Text>
      <Text style={styles.greetingSub}>Your gym overview</Text>

      <View style={styles.kpiRow}>
        <View style={styles.kpiHalf}>
          <KpiCard label="Active Members" value={String(d.activeMembers)} icon="people" color={colors.brand} bg={colors.brandLight} onPress={() => nav.navigate('OwnerTabs', { screen: 'MembersTab' })} />
        </View>
        <View style={styles.kpiHalf}>
          <KpiCard
            label="At Risk"
            value={String(riskedTotal)}
            icon="warning"
            color={colors.danger}
            bg={colors.dangerLight}
            alert
            onPress={() => nav.navigate('AtRisk')}
          />
        </View>
      </View>
      <View style={styles.kpiRow}>
        <View style={styles.kpiHalf}>
          <KpiCard label="Renewals · 30d" value={formatCompactINR(d.renewalsExpected)} icon="calendar" color={colors.warning} bg={colors.warningLight} onPress={() => nav.navigate('OwnerTabs', { screen: 'RenewalsTab' })} />
        </View>
        <View style={styles.kpiHalf}>
          <KpiCard label="Add-on Revenue" value={formatCompactINR(d.addOnRevenue)} icon="wallet" color={colors.info} bg={colors.infoLight} onPress={() => nav.navigate('OwnerTabs', { screen: 'RevenueTab' })} />
        </View>
      </View>

      <Pressable onPress={() => nav.navigate('AtRisk')} style={({ pressed }) => [styles.riskCard, pressed && styles.pressed]}>
        <View style={styles.riskHeader}>
          <Ionicons name="alert-circle" size={22} color={colors.white} />
          <Text style={styles.riskTitle}>{formatINR(d.revenueAtRisk)} Revenue At Risk</Text>
        </View>
        <Text style={styles.riskBody}>
          {riskedTotal} members haven't checked in for 10+ days. Re-engage them before their memberships lapse.
        </Text>
        <View style={styles.riskCta}>
          <Text style={styles.riskCtaText}>View Members</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.white} />
        </View>
      </Pressable>

      <SectionHeader title="Attendance" />
      <Card>
        <View style={styles.attRow}>
          <View style={styles.attStat}>
            <Text style={styles.attValue}>{d.checkinsToday}</Text>
            <Text style={styles.attLabel}>Today</Text>
          </View>
          <View style={styles.attDivider} />
          <View style={styles.attStat}>
            <Text style={styles.attValue}>{d.checkinsThisWeek}</Text>
            <Text style={styles.attLabel}>This Week</Text>
          </View>
          <View style={styles.attDivider} />
          <View style={styles.attStat}>
            <Text style={styles.attValue}>{d.checkinsThisMonth}</Text>
            <Text style={styles.attLabel}>This Month</Text>
          </View>
        </View>
        <MiniBarChart data={d.weeklyTrend} />
      </Card>

      <View style={styles.sectionSpacer} />
      <SectionHeader title="Upcoming renewals" actionLabel="View all" onAction={() => nav.navigate('OwnerTabs', { screen: 'RenewalsTab' })} />
      {d.upcomingRenewals.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="No renewals due soon" />
      ) : (
        d.upcomingRenewals.map((r) => (
          <Pressable
            key={r.membershipId}
            onPress={() => nav.navigate('MemberProfile', { memberId: r.memberId })}
            style={({ pressed }) => [styles.renewalRow, pressed && styles.pressed]}
          >
            <View style={styles.renewalInfo}>
              <Text style={styles.renewalName}>{r.memberName}</Text>
              <Text style={styles.renewalSub}>
                Expires in {r.daysUntilExpiry === 0 ? 'today' : `${r.daysUntilExpiry} days`} · {formatINR(r.price)}
              </Text>
            </View>
            <RiskBadge level={r.riskLevel} />
            <Button title="Remind" size="sm" variant="secondary" onPress={() => remind(r.membershipId)} style={styles.remindBtn} />
          </Pressable>
        ))
      )}

      <View style={styles.sectionSpacer} />
      <SectionHeader title="Revenue opportunities" actionLabel="View Opportunities" onAction={() => nav.navigate('Opportunities')} />
      <View style={styles.oppRow}>
        <Pressable onPress={() => nav.navigate('Opportunities', { category: 'PT' })} style={({ pressed }) => [styles.oppCard, pressed && styles.pressed]}>
          <Text style={styles.oppEmoji}>💪</Text>
          <Text style={styles.oppCount}>{d.opportunities.pt.count} members</Text>
          <Text style={styles.oppLabel}>PT opportunity</Text>
          <Text style={styles.oppValue}>{formatCompactINR(d.opportunities.pt.potential)}</Text>
        </Pressable>
        <Pressable onPress={() => nav.navigate('Opportunities', { category: 'DIET' })} style={({ pressed }) => [styles.oppCard, pressed && styles.pressed]}>
          <Text style={styles.oppEmoji}>🥗</Text>
          <Text style={styles.oppCount}>{d.opportunities.diet.count} members</Text>
          <Text style={styles.oppLabel}>Diet opportunity</Text>
          <Text style={styles.oppValue}>{formatCompactINR(d.opportunities.diet.potential)}</Text>
        </Pressable>
        <Pressable onPress={() => nav.navigate('Opportunities', { category: 'SUPPLEMENT' })} style={({ pressed }) => [styles.oppCard, pressed && styles.pressed]}>
          <Text style={styles.oppEmoji}>🧪</Text>
          <Text style={styles.oppCount}>{d.opportunities.supplement.count} members</Text>
          <Text style={styles.oppLabel}>Supplement opp.</Text>
          <Text style={styles.oppValue}>{formatCompactINR(d.opportunities.supplement.potential)}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { ...typography.display, color: colors.text },
  greetingSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  bellWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  kpiRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  kpiHalf: { flex: 1 },
  riskCard: {
    backgroundColor: colors.danger,
    borderRadius: 16,
    padding: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  pressed: { opacity: 0.9 },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  riskTitle: { ...typography.heading, color: colors.white },
  riskBody: { ...typography.caption, color: 'rgba(255,255,255,0.92)', marginTop: spacing.sm },
  riskCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  riskCtaText: { ...typography.captionStrong, color: colors.white },
  attRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  attStat: { flex: 1, alignItems: 'center' },
  attValue: { ...typography.title, color: colors.text },
  attLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  attDivider: { width: 1, height: 32, backgroundColor: colors.border },
  chart: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chartCol: { flex: 1, alignItems: 'center' },
  chartBarTrack: { height: 64, width: '100%', justifyContent: 'flex-end', backgroundColor: colors.surfaceMuted, borderRadius: 6, overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 6, minHeight: 4 },
  chartDay: { ...typography.small, color: colors.textMuted, marginTop: 4 },
  chartVal: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  sectionSpacer: { height: spacing.xxl },
  renewalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  renewalInfo: { flex: 1 },
  renewalName: { ...typography.bodyStrong, color: colors.text },
  renewalSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  remindBtn: { paddingHorizontal: spacing.md },
  oppRow: { flexDirection: 'row', gap: spacing.md },
  oppCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
  },
  oppEmoji: { fontSize: 20 },
  oppCount: { ...typography.captionStrong, color: colors.text, marginTop: spacing.sm },
  oppLabel: { ...typography.small, color: colors.textSecondary, marginTop: 1 },
  oppValue: { ...typography.captionStrong, color: colors.brand, marginTop: spacing.xs },
});
