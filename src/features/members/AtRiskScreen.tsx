import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { SearchBar } from '../../components/SearchBar';
import { MemberCard } from '../../components/MemberCard';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import type { RiskLevel } from '../../types';
import { fetchAtRiskMembers, sendReminder } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatINR } from '../../utils/format';
import { openCall, openWhatsApp } from '../../utils/linking';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AtRisk'>;

const REMINDER_MSG = (name: string) =>
  `Hi ${name}, we've missed you at Iron Forge Fitness! Your membership is still active — come in for a workout, we're here for you. 💪`;

export function AtRiskScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const initialFilter =
    route.params?.filter === 'CRITICAL' || route.params?.filter === 'AT_RISK' ? route.params.filter : 'ALL';
  const [filter, setFilter] = useState<RiskLevel | 'ALL'>(initialFilter);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.atRisk,
    queryFn: fetchAtRiskMembers,
  });

  const list = useMemo(() => {
    if (!data) return [];
    let l = data.members;
    if (search) {
      l = l.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.phone.includes(search) ||
          m.id.toLowerCase().includes(search),
      );
    }
    if (filter !== 'ALL') l = l.filter((m) => m.risk.level === filter);
    return l;
  }, [data, search, filter]);

  const totalRevenue = useMemo(
    () => (data ? data.members.reduce((a, m) => a + (m.membership?.price ?? 0), 0) : 0),
    [data],
  );

  const selectMode = selected.size > 0;

  const bulkRemind = async () => {
    setSending(true);
    const ids = list.filter((m) => selected.has(m.id) && m.membership).map((m) => m.membership!.id);
    for (const id of ids) await sendReminder(id);
    setSending(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: queryKeys.notifications });
    Alert.alert('Reminders sent', `${ids.length} reminder${ids.length === 1 ? '' : 's'} sent.`);
  };

  return (
    <Screen title="At-Risk Members" refreshing={isRefetching} onRefresh={refetch}>
      <Card padded style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>{data?.members.filter((m) => m.risk.level === 'AT_RISK').length ?? 0}</Text>
            <Text style={styles.summaryLabel}>At Risk</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.critical }]}>{data?.members.filter((m) => m.risk.level === 'CRITICAL').length ?? 0}</Text>
            <Text style={styles.summaryLabel}>Critical</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{formatINR(totalRevenue)}</Text>
            <Text style={styles.summaryLabel}>Revenue at risk</Text>
          </View>
        </View>
      </Card>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone or ID" />
      <View style={styles.chips}>
        {(['ALL', 'CRITICAL', 'AT_RISK'] as const).map((f) => {
          const active = filter === f;
          return (
            <Button
              key={f}
              title={f === 'ALL' ? 'All' : f === 'CRITICAL' ? '🚨 Critical' : '🔴 At Risk'}
              variant={active ? 'danger' : 'outline'}
              size="sm"
              onPress={() => setFilter(f)}
            />
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load at-risk members" />
      ) : list.length === 0 ? (
        <EmptyState icon="shield-checkmark-outline" title="No at-risk members" subtitle="Everyone has checked in within the last 10 days. 🎉" />
      ) : (
        list.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            selectable={selectMode}
            selected={selected.has(m.id)}
            onToggleSelect={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(m.id)) next.delete(m.id);
                else next.add(m.id);
                return next;
              })
            }
            onPress={() => {
              if (selectMode) {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(m.id)) next.delete(m.id);
                  else next.add(m.id);
                  return next;
                });
              } else nav.navigate('MemberProfile', { memberId: m.id });
            }}
            onWhatsApp={() => openWhatsApp(m.phone, REMINDER_MSG(m.name))}
            onCall={() => openCall(m.phone)}
          />
        ))
      )}

      {list.length > 0 && !selectMode ? (
        <Button
          title="Select members to send reminders"
          variant="outline"
          fullWidth
          style={styles.selectAll}
          onPress={() => setSelected(new Set(list.map((m) => m.id)))}
        />
      ) : null}

      {selectMode ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selected.size} selected</Text>
          <Button title="Send Reminder" size="sm" loading={sending} onPress={bulkRemind} />
          <Button title="Cancel" size="sm" variant="ghost" onPress={() => setSelected(new Set())} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.title, fontSize: 20 },
  summaryLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border },
  chips: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  selectAll: { marginTop: spacing.xs },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
  },
  bulkCount: { ...typography.captionStrong, color: colors.text, flex: 1 },
});
