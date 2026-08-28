import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import { fetchOpportunities, fetchRevenueSummary } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatCompactINR, formatDateTime } from '../../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_META = {
  PT: { emoji: '💪', color: colors.brand, bg: colors.brandLight, label: 'Personal Training' },
  DIET: { emoji: '🥗', color: colors.success, bg: colors.successLight, label: 'Diet Plans' },
  SUPPLEMENT: { emoji: '🧪', color: colors.info, bg: colors.infoLight, label: 'Supplements' },
} as const;

export function RevenueScreen() {
  const nav = useNavigation<Nav>();

  const { data: rev, isLoading: revLoading, isError: revError, refetch: revRefetch, isRefetching } = useQuery({
    queryKey: queryKeys.revenue,
    queryFn: fetchRevenueSummary,
  });
  const { data: opp } = useQuery({
    queryKey: queryKeys.opportunities(),
    queryFn: () => fetchOpportunities(),
  });

  const summary = opp?.summary;

  return (
    <Screen
      title="Revenue"
      subtitle={rev ? `${formatCompactINR(rev.totalRevenue)} total add-on revenue` : ' '}
      refreshing={isRefetching}
      onRefresh={revRefetch}
    >
      <View style={styles.kpis}>
        <View style={[styles.kpi, { backgroundColor: colors.brandLight }]}>
          <Text style={[styles.kpiValue, { color: colors.brand }]}>{rev ? formatCompactINR(rev.totalRevenue) : '—'}</Text>
          <Text style={styles.kpiLabel}>All-time revenue</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.infoLight }]}>
          <Text style={[styles.kpiValue, { color: colors.info }]}>{rev ? formatCompactINR(rev.thisMonth) : '—'}</Text>
          <Text style={styles.kpiLabel}>This month</Text>
        </View>
      </View>

      <SectionHeader title="Revenue opportunities" actionLabel="View all" onAction={() => nav.navigate('Opportunities')} />
      <View style={styles.oppRow}>
        {(['PT', 'DIET', 'SUPPLEMENT'] as const).map((cat) => {
          const meta = CATEGORY_META[cat];
          const s = summary?.[cat.toLowerCase() as 'pt' | 'diet' | 'supplement'];
          return (
            <Pressable
              key={cat}
              onPress={() => nav.navigate('Opportunities', { category: cat })}
              style={({ pressed }) => [styles.oppCard, { backgroundColor: meta.bg }, pressed && styles.pressed]}
            >
              <Text style={styles.oppEmoji}>{meta.emoji}</Text>
              <Text style={[styles.oppCount, { color: meta.color }]}>{s?.count ?? 0} prospects</Text>
              <Text style={styles.oppPotential}>{s ? formatCompactINR(s.potential) : '—'} potential</Text>
              <Text style={styles.oppLabel}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => nav.navigate('Services')}
        style={({ pressed }) => [styles.manageCard, pressed && styles.pressed]}
      >
        <View style={styles.manageIcon}>
          <Ionicons name="pricetags-outline" size={20} color={colors.brand} />
        </View>
        <View style={styles.manageInfo}>
          <Text style={styles.manageTitle}>Services & catalogue</Text>
          <Text style={styles.manageSub}>Manage PT, diet and supplement offerings</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.spacer} />
      <SectionHeader title="Recent sales" />
      {revLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : revError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load revenue" />
      ) : rev!.sales.length === 0 ? (
        <EmptyState icon="wallet-outline" title="No sales yet" subtitle="Record your first sale from an opportunity." />
      ) : (
        <Card padded={false} style={styles.salesCard}>
          {rev!.sales.map((s, i) => (
            <View key={s.id} style={[styles.saleRow, i > 0 && styles.saleRowBorder]}>
              <View style={styles.saleEmoji}>
                <Text>{CATEGORY_META[s.serviceName.includes('PT') ? 'PT' : s.serviceName.includes('Diet') ? 'DIET' : 'SUPPLEMENT'].emoji}</Text>
              </View>
              <View style={styles.saleInfo}>
                <Text style={styles.saleName}>{s.memberName}</Text>
                <Text style={styles.saleSub}>{s.serviceName} · {formatDateTime(s.createdAt)}</Text>
              </View>
              <Text style={styles.saleAmount}>{formatCompactINR(s.amount)}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  kpi: { flex: 1, borderRadius: 14, padding: spacing.lg },
  kpiValue: { ...typography.title, fontSize: 20 },
  kpiLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  oppRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  oppCard: { flex: 1, borderRadius: 14, padding: spacing.md, minHeight: 118 },
  oppEmoji: { fontSize: 22 },
  oppCount: { ...typography.captionStrong, marginTop: spacing.sm },
  oppPotential: { ...typography.small, color: colors.textSecondary, marginTop: 1 },
  oppLabel: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  pressed: { opacity: 0.9 },
  manageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  manageIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageInfo: { flex: 1 },
  manageTitle: { ...typography.bodyStrong, color: colors.text },
  manageSub: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  spacer: { height: spacing.xxl },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  salesCard: { paddingHorizontal: spacing.lg },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  saleRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  saleEmoji: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  saleInfo: { flex: 1 },
  saleName: { ...typography.captionStrong, color: colors.text },
  saleSub: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  saleAmount: { ...typography.captionStrong, color: colors.success },
});
