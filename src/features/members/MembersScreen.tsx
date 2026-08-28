import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { SearchBar } from '../../components/SearchBar';
import { MemberCard } from '../../components/MemberCard';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import type { MemberWithRisk, RiskLevel } from '../../types';
import { fetchMembers, sendReminder } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { openCall, openWhatsApp } from '../../utils/linking';
import { daysUntil } from '../../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Filter = 'ALL' | RiskLevel | 'RENEWAL_SOON' | 'OVERDUE';

const FILTERS: { key: Filter; label: string; color?: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CRITICAL', label: '🚨 Critical' },
  { key: 'AT_RISK', label: '🔴 At Risk' },
  { key: 'WATCH', label: '🟡 Watch' },
  { key: 'ACTIVE', label: '🟢 Active' },
  { key: 'RENEWAL_SOON', label: 'Renewal soon' },
  { key: 'OVERDUE', label: 'Payment overdue' },
];

const REMINDER_MSG = (name: string) =>
  `Hi ${name}, this is a reminder from Iron Forge Fitness. Your membership is due for renewal. Reply if you'd like to renew or pause.`;

export function MembersScreen() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<'risk' | 'name' | 'renewal'>('risk');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const queryRisk = (['ACTIVE', 'WATCH', 'AT_RISK', 'CRITICAL'] as const).includes(filter as RiskLevel)
    ? (filter as RiskLevel)
    : '';

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.members({ search, risk: queryRisk, sort }),
    queryFn: () => fetchMembers({ search, risk: queryRisk, sort }),
  });

  const list = useMemo(() => {
    if (!data) return [];
    let l = data.members;
    if (filter === 'RENEWAL_SOON') {
      l = l.filter((m) => m.membership && daysUntil(m.membership.endDate) >= 0 && daysUntil(m.membership.endDate) <= 30);
    } else if (filter === 'OVERDUE') {
      l = l.filter((m) => m.membership?.status === 'EXPIRED');
    }
    return l;
  }, [data, filter]);

  const selectMode = selected.size > 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkRemind = async () => {
    setSending(true);
    const memberships = list
      .filter((m) => selected.has(m.id) && m.membership)
      .map((m) => m.membership!.id);
    let sent = 0;
    for (const id of memberships) {
      await sendReminder(id);
      sent++;
    }
    setSending(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: queryKeys.notifications });
    Alert.alert('Reminders sent', `${sent} renewal reminder${sent === 1 ? '' : 's'} sent.`);
  };

  const headerRight = (
    <Pressable accessibilityLabel="Notifications" testID="notifications-bell" onPress={() => nav.navigate('Notifications')} hitSlop={8} style={styles.iconBtn}>
      <Ionicons name="notifications-outline" size={20} color={colors.text} />
    </Pressable>
  );

  return (
    <Screen
      title="Members"
      subtitle={data ? `${list.length} members` : ' '}
      headerRight={headerRight}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone or ID" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Sort by</Text>
        {(['risk', 'name', 'renewal'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSort(s)} style={[styles.sortChip, sort === s && styles.sortChipActive]}>
            <Text style={[styles.sortLabel, sort === s && styles.sortLabelActive]}>{s === 'risk' ? 'Risk' : s === 'name' ? 'Name' : 'Renewal'}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load members" subtitle="Pull to refresh to retry." />
      ) : list.length === 0 ? (
        <EmptyState icon="people-outline" title="No members found" subtitle="Try a different search or filter." />
      ) : (
        <>
          {list.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              selectable={selectMode}
              selected={selected.has(m.id)}
              onToggleSelect={() => toggleSelect(m.id)}
              onPress={() => {
                if (selectMode) toggleSelect(m.id);
                else nav.navigate('MemberProfile', { memberId: m.id });
              }}
              onWhatsApp={() => openWhatsApp(m.phone, REMINDER_MSG(m.name))}
              onCall={() => openCall(m.phone)}
            />
          ))}
        </>
      )}

      {list.length > 0 && !selectMode ? (
        <Pressable
          onPress={() => setSelected(new Set(list.map((m) => m.id)))}
          style={styles.selectAll}
        >
          <Ionicons name="checkbox-outline" size={16} color={colors.brand} />
          <Text style={styles.selectAllLabel}>Select members for bulk actions</Text>
        </Pressable>
      ) : null}

      {selectMode ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selected.size} selected</Text>
          <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
            <Text style={styles.bulkCancel}>Cancel</Text>
          </Pressable>
          <View style={styles.bulkActions}>
            <Button title="Send Reminder" size="sm" loading={sending} onPress={bulkRemind} />
            <Button
              title="WhatsApp"
              size="sm"
              variant="outline"
              onPress={() => {
                const [first] = [...list].filter((m) => selected.has(m.id));
                if (first) openWhatsApp(first.phone, REMINDER_MSG(first.name));
              }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsScroll: { marginVertical: spacing.md, flexGrow: 0 },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipLabel: { ...typography.captionStrong, color: colors.textSecondary },
  chipLabelActive: { color: colors.white },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  toolbarLabel: { ...typography.label, color: colors.textMuted },
  sortChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  sortChipActive: { backgroundColor: colors.brandLight },
  sortLabel: { ...typography.captionStrong, color: colors.textSecondary, fontSize: 12 },
  sortLabelActive: { color: colors.brandDark },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: spacing.md },
  selectAllLabel: { ...typography.captionStrong, color: colors.brand },
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
  bulkCancel: { ...typography.captionStrong, color: colors.textMuted },
  bulkActions: { flexDirection: 'row', gap: spacing.sm },
});
