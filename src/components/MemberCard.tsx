import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MemberWithRisk } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';
import { RiskBadge } from './RiskBadge';
import { formatDate, daysUntil } from '../utils/format';

interface Props {
  member: MemberWithRisk;
  onPress?: () => void;
  onWhatsApp?: () => void;
  onCall?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectable?: boolean;
}

export function MemberCard({ member, onPress, onWhatsApp, onCall, selected, onToggleSelect, selectable }: Props) {
  const { risk, membership } = member;
  const daysLabel =
    risk.daysInactive < 0 ? 'Never checked in' : `${risk.daysInactive} days inactive`;
  const renewalInfo = membership
    ? membership.status === 'EXPIRED'
      ? `Overdue · was ${formatDate(membership.endDate)}`
      : `Renewal ${formatDate(membership.endDate)} · ${Math.abs(daysUntil(membership.endDate))}d`
    : 'No membership';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {selectable ? (
        <Pressable onPress={onToggleSelect} hitSlop={8} style={styles.check}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.brand : colors.textMuted}
          />
        </Pressable>
      ) : null}
      <Avatar name={member.name} size={44} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {member.name}
          </Text>
          <RiskBadge level={risk.level} />
        </View>
        <Text style={styles.sub}>
          {risk.level === 'ACTIVE' && member.lastCheckInAt
            ? `Last check-in ${formatDate(member.lastCheckInAt)}`
            : daysLabel}
          {membership ? ` · ${membership.planName}` : ''}
        </Text>
        <Text style={styles.sub2}>{renewalInfo}</Text>
      </View>
      {onWhatsApp || onCall ? (
        <View style={styles.actions}>
          {onWhatsApp ? (
            <Pressable onPress={onWhatsApp} style={[styles.iconBtn, { backgroundColor: colors.whatsapp }]}>
              <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
            </Pressable>
          ) : null}
          {onCall ? (
            <Pressable onPress={onCall} style={[styles.iconBtn, { backgroundColor: colors.call }]}>
              <Ionicons name="call" size={15} color={colors.white} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.85 },
  check: { marginRight: -4 },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  sub: { ...typography.caption, color: colors.textSecondary },
  sub2: { ...typography.small, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
