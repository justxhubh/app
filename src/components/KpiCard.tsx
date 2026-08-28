import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  bg?: string;
  onPress?: () => void;
  alert?: boolean;
}

export function KpiCard({ label, value, icon, color = colors.brand, bg = colors.brandLight, onPress, alert }: Props) {
  const content = (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.white }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {alert ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 118,
    justifyContent: 'space-between',
    position: 'relative',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { ...typography.display, fontSize: 24, marginTop: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary },
  dot: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
