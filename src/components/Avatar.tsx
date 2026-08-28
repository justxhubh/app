import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme';

interface Props {
  name: string;
  size?: number;
  color?: string;
}

const PALETTE = [
  '#6D28D9', '#2563EB', '#0D9488', '#DB2777', '#D97706', '#4F46E5', '#0F766E', '#C026D3',
];

export function Avatar({ name, size = 44, color }: Props) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = color ?? PALETTE[hash % PALETTE.length];
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={{ ...typography.captionStrong, color: colors.white, fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
