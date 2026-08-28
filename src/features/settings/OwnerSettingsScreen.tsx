import React, { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { RiskLevel, RiskThresholds } from '../../types';
import { fetchGymSettings, fetchMembers, updateRiskThresholds } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { riskLevelForDays, RISK_META } from '../../utils/risk';
import { daysSince } from '../../utils/format';

const schema = z.object({
  activeMax: z.coerce.number().int().min(0, 'Whole number, 0+'),
  watchMax: z.coerce.number().int().min(0, 'Whole number, 0+'),
  atRiskMax: z.coerce.number().int().min(0, 'Whole number, 0+'),
});
type Form = z.infer<typeof schema>;

const resolver = zodResolver(schema) as unknown as Resolver<Form>;

const BUCKET_ORDER: RiskLevel[] = ['ACTIVE', 'WATCH', 'AT_RISK', 'CRITICAL'];

export function OwnerSettingsScreen() {
  const qc = useQueryClient();
  const { control, handleSubmit, reset, watch } = useForm<Form>({
    resolver,
    defaultValues: { activeMax: 4, watchMax: 9, atRiskMax: 14 },
  });

  const { data: settings, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.settings,
    queryFn: fetchGymSettings,
  });

  const { data: members } = useQuery({
    queryKey: queryKeys.members({ sort: 'name' }),
    queryFn: () => fetchMembers({ sort: 'name' }),
  });

  const values = watch();
  const draft: RiskThresholds = {
    activeMax: Number(values.activeMax),
    watchMax: Number(values.watchMax),
    atRiskMax: Number(values.atRiskMax),
  };
  const ordered = draft.activeMax < draft.watchMax && draft.watchMax < draft.atRiskMax;

  // Load current thresholds once settings arrive.
  useEffect(() => {
    if (settings) {
      reset({
        activeMax: settings.riskThresholds.activeMax,
        watchMax: settings.riskThresholds.watchMax,
        atRiskMax: settings.riskThresholds.atRiskMax,
      });
    }
  }, [settings, reset]);

  // Live preview: bucket members by the draft thresholds.
  const preview = useMemo(() => {
    const counts: Record<RiskLevel, number> = { ACTIVE: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0 };
    if (!members || !ordered) return counts;
    for (const m of members.members) {
      counts[riskLevelForDays(daysSince(m.lastCheckInAt), draft)]++;
    }
    return counts;
  }, [members, draft, ordered]);

  const unchanged =
    !!settings &&
    settings.riskThresholds.activeMax === draft.activeMax &&
    settings.riskThresholds.watchMax === draft.watchMax &&
    settings.riskThresholds.atRiskMax === draft.atRiskMax;

  const save = async (f: Form) => {
    try {
      await updateRiskThresholds({
        activeMax: f.activeMax,
        watchMax: f.watchMax,
        atRiskMax: f.atRiskMax,
      });
      qc.invalidateQueries({ queryKey: queryKeys.settings });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      qc.invalidateQueries({ queryKey: queryKeys.riskSummary });
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: queryKeys.atRisk });
      Alert.alert('Saved', 'Risk thresholds updated. The dashboard now reflects the new rules.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save settings');
    }
  };

  if (isLoading) {
    return (
      <Screen title="Settings" scroll={false}>
        <View style={styles.loading}><Spinner /></View>
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen title="Settings">
        <EmptyState icon="cloud-offline-outline" title="Couldn't load settings" />
      </Screen>
    );
  }

  return (
    <Screen title="Settings" subtitle="Gym OS · Iron Forge Fitness" refreshing={isRefetching} onRefresh={refetch}>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Risk detection</Text>
        <Text style={styles.sectionBody}>
          Members are flagged by days since their last check-in. Adjust the thresholds to
          match how your gym wants to chase inactivity.
        </Text>

        <Text style={styles.fieldLabel}>Active · up to (days)</Text>
        <Controller
          control={control}
          name="activeMax"
          render={({ field, fieldState }) => (
            <TextInput
              value={field.value === undefined || field.value === null ? '' : String(field.value)}
              onChangeText={(t) => field.onChange(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="4"
              error={fieldState.error?.message}
            />
          )}
        />
        <Text style={styles.fieldLabel}>Watch · up to (days)</Text>
        <Controller
          control={control}
          name="watchMax"
          render={({ field, fieldState }) => (
            <TextInput
              value={field.value === undefined || field.value === null ? '' : String(field.value)}
              onChangeText={(t) => field.onChange(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="9"
              error={fieldState.error?.message}
            />
          )}
        />
        <Text style={styles.fieldLabel}>At Risk · up to (days)</Text>
        <Controller
          control={control}
          name="atRiskMax"
          render={({ field, fieldState }) => (
            <TextInput
              value={field.value === undefined || field.value === null ? '' : String(field.value)}
              onChangeText={(t) => field.onChange(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="14"
              error={fieldState.error?.message}
            />
          )}
        />
        {!ordered ? (
          <Text style={styles.invalid}>Thresholds must be strictly increasing: Active &lt; Watch &lt; At Risk.</Text>
        ) : null}

        <Button
          title="Save thresholds"
          fullWidth
          disabled={!ordered || unchanged}
          onPress={handleSubmit(save)}
          style={styles.saveBtn}
        />
      </Card>

      <View style={styles.spacer} />
      <Text style={styles.previewTitle}>Preview</Text>
      <Card>
        <View style={styles.previewRow}>
          {BUCKET_ORDER.map((level, i) => {
            const meta = RISK_META[level];
            return (
              <React.Fragment key={level}>
                {i > 0 ? <View style={styles.previewDivider} /> : null}
                <View style={styles.previewStat}>
                  <Text style={[styles.previewValue, { color: meta.color }]}>
                    {ordered ? preview[level] : '—'}
                  </Text>
                  <Text style={styles.previewLabel}>{meta.emoji} {meta.label}</Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
        <Text style={styles.previewNote}>
          {ordered
            ? 'Members re-classified with the new thresholds. Saving applies them gym-wide.'
            : 'Enter valid thresholds to see the member re-classification.'}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  invalid: { ...typography.captionStrong, color: colors.danger, marginTop: spacing.sm },
  saveBtn: { marginTop: spacing.xl },
  spacer: { height: spacing.lg },
  previewTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  previewStat: { flex: 1, alignItems: 'center' },
  previewValue: { ...typography.title, fontSize: 22 },
  previewLabel: { ...typography.small, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  previewDivider: { width: 1, height: 36, backgroundColor: colors.border },
  previewNote: { ...typography.small, color: colors.textMuted, marginTop: spacing.lg },
});
