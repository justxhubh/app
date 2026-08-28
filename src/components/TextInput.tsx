import React from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props extends TextInputProps {
  prefix?: string;
  error?: string;
}

export function TextInput({ prefix, error, style, ...rest }: Props) {
  return (
    <View>
      <View style={[styles.wrap, error ? styles.errorWrap : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <RNTextInput placeholderTextColor={colors.textMuted} style={styles.input} {...rest} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  errorWrap: { borderColor: colors.danger },
  prefix: { color: colors.textSecondary, marginRight: spacing.sm, fontSize: 16, fontWeight: '500' },
  input: { flex: 1, fontSize: 16, color: colors.text, height: 48 },
  error: { ...typography.caption, color: colors.danger, marginTop: 4 },
});
