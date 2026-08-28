import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  muted?: boolean;
}

export function Card({ children, style, padded = true, muted = false }: Props) {
  return (
    <View
      style={[
        styles.card,
        muted && { backgroundColor: colors.surfaceMuted, shadowOpacity: 0 },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  padded: { padding: spacing.lg },
});
