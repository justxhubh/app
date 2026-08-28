import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';

interface Props {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
  back?: boolean;
  onBack?: () => void;
}

export function Screen({
  children,
  title,
  subtitle,
  headerRight,
  scroll = true,
  refreshing,
  onRefresh,
  contentContainerStyle,
  style,
  back,
  onBack,
}: Props) {
  const hasHeader = !!(title || headerRight);
  const header = hasHeader ? (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {back ? (
          <Ionicons
            name="chevron-back"
            size={26}
            color={colors.text}
            onPress={onBack}
            style={styles.backBtn}
          />
        ) : null}
        {title ? (
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
      </View>
      {headerRight}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safe, style]} edges={['top']}>
        {header}
        <View style={styles.body}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, style]} edges={['top']}>
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  headerText: { flexShrink: 1 },
  backBtn: { marginRight: spacing.xs },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  body: { flex: 1, padding: spacing.lg },
});
