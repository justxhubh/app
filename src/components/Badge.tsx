import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  color?: string;
  bg?: string;
  emoji?: string;
}

export function Badge({ label, color = colors.textSecondary, bg = colors.surfaceMuted, emoji }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  emoji: { fontSize: 12 },
  label: { ...typography.label, fontSize: 11 },
});
