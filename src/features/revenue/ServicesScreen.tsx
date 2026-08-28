import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import type { ServiceCategory } from '../../types';
import { createService, fetchServices } from '../../services/api/endpoints';
import { queryKeys } from '../../store/queryKeys';
import { formatINR } from '../../utils/format';

const schema = z.object({
  name: z.string().min(3, 'Service name is required'),
  category: z.enum(['PT', 'DIET', 'SUPPLEMENT']),
  price: z.coerce.number().min(1, 'Enter a valid price'),
});
type Form = z.infer<typeof schema>;
// z.coerce.number() makes the input type differ from the output type;
// bridge the gap for react-hook-form.
const resolver = zodResolver(schema) as unknown as Resolver<Form>;

const CATEGORY_BADGE = {
  PT: { label: 'PT', color: colors.brand, bg: colors.brandLight },
  DIET: { label: 'Diet', color: colors.success, bg: colors.successLight },
  SUPPLEMENT: { label: 'Supplement', color: colors.info, bg: colors.infoLight },
} as const;

export function ServicesScreen() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.services,
    queryFn: fetchServices,
  });

  const { control, handleSubmit, reset } = useForm<Form>({
    resolver,
    defaultValues: { name: '', category: 'PT', price: undefined },
  });

  const save = async (values: Form) => {
    setSaving(true);
    try {
      await createService({ name: values.name, category: values.category, price: values.price });
      qc.invalidateQueries({ queryKey: queryKeys.services });
      reset({ name: '', category: 'PT', price: undefined });
      setShowForm(false);
      Alert.alert('Added', `${values.name} added to your catalogue.`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const grouped = data?.services.filter((s) => s.active) ?? [];

  return (
    <Screen
      title="Services & Catalogue"
      subtitle="PT, diet and supplement offerings"
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <Button
        title={showForm ? 'Close form' : '+ Add service'}
        variant={showForm ? 'ghost' : 'primary'}
        fullWidth
        onPress={() => setShowForm((v) => !v)}
      />

      {showForm ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>New service</Text>
          <Text style={styles.fieldLabel}>Name</Text>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <TextInput value={field.value} onChangeText={field.onChange} placeholder="e.g. 8 PT Sessions" error={fieldState.error?.message} />
            )}
          />
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {(['PT', 'DIET', 'SUPPLEMENT'] as const).map((c) => (
              <Controller
                key={c}
                control={control}
                name="category"
                render={({ field }) => (
                  <Button
                    title={c === 'PT' ? '💪 PT' : c === 'DIET' ? '🥗 Diet' : '🧪 Supplements'}
                    size="sm"
                    variant={field.value === c ? 'primary' : 'outline'}
                    style={styles.categoryBtn}
                    onPress={() => field.onChange(c)}
                  />
                )}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>Price (₹)</Text>
          <Controller
            control={control}
            name="price"
            render={({ field, fieldState }) => (
              <TextInput
                value={field.value ? String(field.value) : ''}
                onChangeText={(t) => field.onChange(t.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 4000"
                keyboardType="number-pad"
                error={fieldState.error?.message}
              />
            )}
          />
          <Button title="Add to catalogue" onPress={handleSubmit(save)} loading={saving} fullWidth style={styles.saveBtn} />
        </Card>
      ) : null}

      <View style={styles.spacer} />
      {isLoading ? (
        <View style={styles.loading}><Spinner /></View>
      ) : isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load services" />
      ) : grouped.length === 0 ? (
        <EmptyState icon="pricetags-outline" title="No services yet" subtitle="Add your first PT, diet or supplement offering." />
      ) : (
        grouped.map((s) => {
          const meta = CATEGORY_BADGE[s.category];
          return (
            <Card key={s.id} style={styles.serviceCard}>
              <View style={styles.serviceRow}>
                <Text style={styles.serviceEmoji}>{s.category === 'PT' ? '💪' : s.category === 'DIET' ? '🥗' : '🧪'}</Text>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  <Text style={styles.servicePrice}>{formatINR(s.price)}</Text>
                </View>
                <Badge label={meta.label} color={meta.color} bg={meta.bg} />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: { marginTop: spacing.lg },
  formTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.md },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  categoryRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  categoryBtn: { flexGrow: 1 },
  saveBtn: { marginTop: spacing.xl },
  spacer: { height: spacing.lg },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  serviceCard: { marginBottom: spacing.md },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  serviceEmoji: { fontSize: 22 },
  serviceInfo: { flex: 1 },
  serviceName: { ...typography.bodyStrong, color: colors.text },
  servicePrice: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
