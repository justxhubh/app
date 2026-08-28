import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme';

export function Spinner({ color = colors.brand }: { color?: string }) {
  return <ActivityIndicator size="large" color={color} />;
}

export function FullScreenLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <Spinner />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: 12 },
});
