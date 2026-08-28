import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import type { ServiceCategory } from '../../types';
import { fetchOpportunities, recordSale } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatINR } from '../../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Opportunities'>;

const CATEGORIES: { key: ServiceCategory | 'ALL'; label: string; emoji: string }[] = [
  { key: 'ALL', label: 'All', emoji: '✨' },
  { key: 'PT', label: 'PT', emoji: '💪' },
  { key: 'DIET', label: 'Diet', emoji: '🥗' },
  { key: 'SUPPLEMENT', label: 'Supplements', emoji: '🧪' },
];

export function OpportunitiesScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const [category, setCategory] = useState<ServiceCategory | 'ALL'>(route.params?.category ?? 'ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.opportunities(category === 'ALL' ? undefined : category),
    queryFn: () => fetchOpportunities(category === 'ALL' ? undefined : category),
  });

  const offer = async (memberId: string, serviceId: string) => {
    setBusyId(`${memberId}-${serviceId}`);
    try {
      const res = await recordSale(memberId, serviceId);
      Alert.alert('Sale recorded', res.message);
      qc.invalidateQueries({ queryKey: queryKeys.opportunities() });
      qc.invalidateQueries({ queryKey: queryKeys.revenue });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen
      title="Revenue Opportunities"
      subtitle={data ? `${data.opportunities.length} eligible members` : ' '}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <View style={styles.chips}>
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <Button
              key={c.key}
              title={`${c.emoji} ${c.label}`}
              size="sm"
              variant={active ? 'primary' : 'outline'}
              onPress={() => setCategory(c.key)}
            />
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load opportunities" />
      ) : data!.opportunities.length === 0 ? (
        <EmptyState icon="sparkles-outline" title="No opportunities right now" subtitle="New prospects appear as members stay active." />
      ) : (
        data!.opportunities.map((o) => (
          <Card key={`${o.memberId}-${o.serviceId}`} style={styles.oppCard}>
            <View style={styles.oppRow}>
              <Avatar name={o.memberName} size={40} />
              <View style={styles.oppInfo}>
                <Text style={styles.oppName}>{o.memberName}</Text>
                <Text style={styles.oppService}>{o.serviceName} · {formatINR(o.price)}</Text>
                <View style={styles.reasonRow}>
                  <Ionicons name="bulb-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.oppReason}>{o.reason}</Text>
                </View>
              </View>
              <Button
                title="Offer"
                size="sm"
                variant="secondary"
                loading={busyId === `${o.memberId}-${o.serviceId}`}
                onPress={() => offer(o.memberId, o.serviceId)}
              />
            </View>
            <View style={styles.oppActions}>
              <Button
                title="View profile"
                size="sm"
                variant="ghost"
                onPress={() => nav.navigate('MemberProfile', { memberId: o.memberId })}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  oppCard: { marginBottom: spacing.md },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  oppInfo: { flex: 1 },
  oppName: { ...typography.bodyStrong, color: colors.text },
  oppService: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  oppReason: { ...typography.small, color: colors.textMuted, flex: 1 },
  oppActions: { marginTop: spacing.sm, alignItems: 'flex-start' },
});
