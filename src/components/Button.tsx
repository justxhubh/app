import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
}

const palette: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.brand, text: colors.white },
  secondary: { bg: colors.brandLight, text: colors.brandDark },
  danger: { bg: colors.danger, text: colors.white },
  success: { bg: colors.success, text: colors.white },
  ghost: { bg: 'transparent', text: colors.textSecondary },
  outline: { bg: 'transparent', text: colors.brand, border: colors.brand },
};

const heights: Record<Size, number> = { sm: 34, md: 44, lg: 52 };
const fontSizes: Record<Size, number> = { sm: 13, md: 15, lg: 16 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  fullWidth,
}: Props) {
  const p = palette[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: p.bg,
          height: heights[size],
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.text} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.label,
              { color: p.text, fontSize: fontSizes[size] },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { fontWeight: '700' },
  fullWidth: { width: '100%' },
});
