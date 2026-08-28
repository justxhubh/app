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
import { Badge } from '../../components/Badge';
import { RiskBadge } from '../../components/RiskBadge';
import { Button } from '../../components/Button';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RootStackParamList } from '../../app/navigation/types';
import { fetchMemberProfile, recordSale, renewMembership, sendReminder } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatDate, formatINR, formatDateTime } from '../../utils/format';
import { openCall, openWhatsApp } from '../../utils/linking';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'MemberProfile'>;

const OPPORTUNITY_SERVICES = {
  pt: 'svc-pt',
  diet: 'svc-diet',
  supplement: 'svc-whey',
} as const;

const OPPORTUNITY_EMOJI = { pt: '💪', diet: '🥗', supplement: '🧪' } as const;

export function MemberProfileScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'remind' | 'renew' | 'pt' | 'diet' | 'supplement' | null>(null);

  const { memberId } = route.params;
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.memberProfile(memberId),
    queryFn: () => fetchMemberProfile(memberId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.memberProfile(memberId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: queryKeys.revenue });
    qc.invalidateQueries({ queryKey: queryKeys.notifications });
  };

  const run = async (key: 'remind' | 'renew' | 'pt' | 'diet' | 'supplement', fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      Alert.alert('Done', success);
      invalidate();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <Screen title="Member Profile" scroll={false}>
        <View style={styles.loading}><Spinner /></View>
      </Screen>
    );
  }
  if (isError || !data) {
    return (
      <Screen title="Member Profile">
        <EmptyState icon="cloud-offline-outline" title="Couldn't load member" />
      </Screen>
    );
  }

  const { member, membership, timeline, opportunities } = data;
  const meta = member.risk;
  const paymentOk = membership?.status === 'ACTIVE';

  return (
    <Screen title="Member Profile" refreshing={isRefetching} onRefresh={refetch}>
      <Card style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Avatar name={member.name} size={64} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{member.name}</Text>
            <Text style={styles.plan}>{membership?.planName ?? 'No membership'}</Text>
            <View style={styles.badges}>
              <Badge
                label={member.status === 'ACTIVE' ? 'Active' : member.status}
                color={member.status === 'ACTIVE' ? colors.success : colors.danger}
                bg={member.status === 'ACTIVE' ? colors.successLight : colors.dangerLight}
              />
              <RiskBadge level={meta.level} />
            </View>
          </View>
        </View>
      </Card>

      <SectionHeader title="Information" />
      <Card>
        <InfoRow label="Phone" value={member.phone} />
        <InfoRow label="Email" value={member.email ?? '—'} />
        <InfoRow label="Plan" value={membership?.planName ?? '—'} />
        <InfoRow label="Start date" value={membership ? formatDate(membership.startDate) : '—'} />
        <InfoRow label="Expiry date" value={membership ? formatDate(membership.endDate) : '—'} last />
        <InfoRow label="Monthly fee" value={membership ? formatINR(membership.price) : '—'} />
        <InfoRow label="Payment status" value={paymentOk ? 'Paid' : 'Overdue'} valueColor={paymentOk ? colors.success : colors.danger} last />
      </Card>

      <View style={styles.spacer} />
      <SectionHeader title="Attendance" />
      <Card>
        <View style={styles.attRow}>
          <View style={styles.attStat}>
            <Text style={styles.attValue}>{member.lastCheckInAt ? formatDate(member.lastCheckInAt) : 'Never'}</Text>
            <Text style={styles.attLabel}>Last check-in</Text>
          </View>
          <View style={styles.attDivider} />
          <View style={styles.attStat}>
            <Text style={styles.attValue}>{member.currentStreak} days</Text>
            <Text style={styles.attLabel}>Current streak</Text>
          </View>
          <View style={styles.attDivider} />
          <View style={styles.attStat}>
            <Text style={styles.attValue}>{member.monthlyAttendance} / 30</Text>
            <Text style={styles.attLabel}>Monthly attendance</Text>
          </View>
        </View>
      </Card>

      <View style={styles.spacer} />
      <SectionHeader title="Timeline" />
      <Card padded={false} style={styles.timelineCard}>
        {timeline.slice(0, 12).map((e, i) => (
          <View key={e.id} style={[styles.timelineRow, i > 0 && styles.timelineRowBorder]}>
            <View style={[styles.timelineDot, { backgroundColor: dotColor(e.type) }]} />
            <View style={styles.timelineInfo}>
              <Text style={styles.timelineTitle}>{e.title}</Text>
              <Text style={styles.timelineSub}>{formatDateTime(e.at)}</Text>
            </View>
            {e.amount ? <Text style={styles.timelineAmount}>{formatINR(e.amount)}</Text> : null}
          </View>
        ))}
      </Card>

      <View style={styles.spacer} />
      <SectionHeader title="Revenue opportunities" />
      <Card>
        {(['pt', 'diet', 'supplement'] as const).map((key) => {
          const purchased = !opportunities[key];
          return (
            <View key={key} style={styles.oppRow}>
              <Text style={styles.oppEmoji}>{OPPORTUNITY_EMOJI[key]}</Text>
              <View style={styles.oppInfo}>
                <Text style={styles.oppName}>{key.toUpperCase()}</Text>
                <Text style={styles.oppSub}>{purchased ? 'Purchased' : 'Not purchased'}</Text>
              </View>
              {!purchased ? (
                <Button
                  title="Add"
                  size="sm"
                  variant="secondary"
                  loading={busy === key}
                  onPress={() =>
                    run(key, () => recordSale(member.id, OPPORTUNITY_SERVICES[key]), `${key.toUpperCase()} added to ${member.name}'s account`)
                  }
                />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              )}
            </View>
          );
        })}
      </Card>

      <View style={styles.spacer} />
      <View style={styles.actionRow}>
        <Button title="Call" variant="outline" icon={<Ionicons name="call" size={16} color={colors.call} />} style={styles.actionBtn} onPress={() => openCall(member.phone)} />
        <Button title="WhatsApp" variant="outline" icon={<Ionicons name="logo-whatsapp" size={16} color={colors.whatsapp} />} style={styles.actionBtn} onPress={() => openWhatsApp(member.phone)} />
      </View>
      <View style={styles.actionRow}>
        {membership ? (
          <>
            <Button
              title="Send renewal"
              variant="secondary"
              loading={busy === 'remind'}
              style={styles.actionBtn}
              onPress={() => run('remind', () => sendReminder(membership.id), 'Renewal reminder sent')}
            />
            <Button
              title={membership.status === 'EXPIRED' ? 'Renew now' : 'Renew'}
              variant="primary"
              loading={busy === 'renew'}
              style={styles.actionBtn}
              onPress={() => run('renew', () => renewMembership(membership.id), 'Membership renewed')}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function dotColor(type: string): string {
  switch (type) {
    case 'CHECKIN': return colors.success;
    case 'PAYMENT': return colors.info;
    case 'RENEWAL': return colors.brand;
    case 'SALE': return colors.warning;
    default: return colors.textMuted;
  }
}

function InfoRow({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileCard: { marginBottom: spacing.xl },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  profileInfo: { flex: 1 },
  name: { ...typography.title, color: colors.text },
  plan: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  spacer: { height: spacing.xxl },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  infoLabel: { ...typography.caption, color: colors.textSecondary },
  infoValue: { ...typography.captionStrong, color: colors.text },
  attRow: { flexDirection: 'row', alignItems: 'center' },
  attStat: { flex: 1, alignItems: 'center' },
  attValue: { ...typography.captionStrong, color: colors.text, fontSize: 14 },
  attLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  attDivider: { width: 1, height: 32, backgroundColor: colors.border },
  timelineCard: { paddingHorizontal: spacing.lg },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  timelineRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.md },
  timelineInfo: { flex: 1 },
  timelineTitle: { ...typography.captionStrong, color: colors.text },
  timelineSub: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  timelineAmount: { ...typography.captionStrong, color: colors.text },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  oppEmoji: { fontSize: 20 },
  oppInfo: { flex: 1 },
  oppName: { ...typography.captionStrong, color: colors.text },
  oppSub: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  actionBtn: { flex: 1 },
});
