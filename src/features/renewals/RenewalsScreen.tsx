import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import { fetchRenewals, renewMembership, sendReminder } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatDate, formatINR } from '../../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RenewalsScreen() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.renewals,
    queryFn: fetchRenewals,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.renewals });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: queryKeys.notifications });
  };

  const remind = async (id: string) => {
    setBusyId(`remind-${id}`);
    try {
      await sendReminder(id);
      Alert.alert('Reminder sent', 'The renewal reminder has been sent.');
      invalidate();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const renew = async (id: string) => {
    setBusyId(`renew-${id}`);
    try {
      await renewMembership(id);
      Alert.alert('Renewed', 'Membership renewed successfully.');
      invalidate();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const stats = data
    ? {
        dueToday: data.renewals.filter((r) => r.daysUntilExpiry === 0).length,
        next7: data.renewals.filter((r) => r.daysUntilExpiry > 0 && r.daysUntilExpiry <= 7).length,
        next30: data.renewals.filter((r) => r.daysUntilExpiry > 0 && r.daysUntilExpiry <= 30).length,
        overdue: data.renewals.filter((r) => r.daysUntilExpiry < 0).length,
      }
    : { dueToday: 0, next7: 0, next30: 0, overdue: 0 };

  return (
    <Screen
      title="Renewals"
      subtitle={data ? `${formatINR(data.expected)} expected in next 30 days` : ' '}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <Card padded style={styles.summaryCard}>
        <View style={styles.summaryGrid}>
          <SummaryStat value={stats.dueToday} label="Due Today" color={colors.warning} />
          <SummaryStat value={stats.next7} label="Next 7 Days" color={colors.info} />
          <SummaryStat value={stats.next30} label="Next 30 Days" color={colors.brand} />
          <SummaryStat value={stats.overdue} label="Overdue" color={colors.danger} />
        </View>
      </Card>

      {isLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load renewals" />
      ) : data!.renewals.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No memberships found" />
      ) : (
        data!.renewals.map((r) => {
          const overdue = r.daysUntilExpiry < 0;
          return (
            <Card key={r.id} style={styles.renewalCard}>
              <View style={styles.renewalTop}>
                <View style={styles.renewalInfo}>
                  <Text style={styles.name}>{r.memberName}</Text>
                  <Text style={styles.plan}>{r.planName} · {formatINR(r.price)}</Text>
                  <Text style={styles.expiry}>
                    {overdue
                      ? `Overdue since ${formatDate(r.endDate)}`
                      : r.daysUntilExpiry === 0
                        ? 'Expires today'
                        : `Expires in ${r.daysUntilExpiry} days · ${formatDate(r.endDate)}`}
                  </Text>
                </View>
                <Badge
                  label={overdue ? 'Overdue' : r.status === 'ACTIVE' ? 'Active' : r.status}
                  color={overdue ? colors.danger : colors.success}
                  bg={overdue ? colors.dangerLight : colors.successLight}
                />
              </View>
              <View style={styles.renewalActions}>
                <Button
                  title="Send Reminder"
                  size="sm"
                  variant="secondary"
                  style={styles.renewalBtn}
                  loading={busyId === `remind-${r.id}`}
                  onPress={() => remind(r.id)}
                />
                <Button
                  title="Renew"
                  size="sm"
                  variant={overdue ? 'danger' : 'primary'}
                  style={styles.renewalBtn}
                  loading={busyId === `renew-${r.id}`}
                  onPress={() => renew(r.id)}
                />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function SummaryStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { marginBottom: spacing.lg },
  summaryGrid: { flexDirection: 'row' },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.title, fontSize: 22 },
  summaryLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  renewalCard: { marginBottom: spacing.md },
  renewalTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  renewalInfo: { flex: 1 },
  name: { ...typography.bodyStrong, color: colors.text },
  plan: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  expiry: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  renewalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  renewalBtn: { flex: 1 },
});
