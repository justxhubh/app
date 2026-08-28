import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../app/navigation/types';
import { useAuthStore } from '../../store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../../components/TextInput';

const schema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
});
type Form = z.infer<typeof schema>;

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const OWNER_DEMO_PHONE = '9822000000';
export const MEMBER_DEMO_PHONE = '9876543210';

export function LoginScreen({ navigation }: Props) {
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });

  const doLogin = async (phone: string) => {
    setError(null);
    setSending(true);
    try {
      await sendOtp(phone);
      navigation.navigate('Otp', { phone });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <Ionicons name="barbell" size={28} color={colors.white} />
          </View>
          <Text style={styles.title}>Iron Forge Fitness</Text>
          <Text style={styles.subtitle}>
            Gym retention & revenue, in one dashboard
          </Text>

          <Card style={styles.formCard}>
            <Text style={styles.fieldLabel}>Mobile number</Text>
            <Controller
              control={control}
              name="phone"
              render={({ field, fieldState }) => (
                <>
                  <TextInput
                    value={field.value}
                    onChangeText={(t) => {
                      field.onChange(t.replace(/[^0-9]/g, '').slice(0, 10));
                      setError(null);
                    }}
                    placeholder="10-digit mobile number"
                    keyboardType="phone-pad"
                    prefix="+91"
                    error={fieldState.error?.message}
                  />
                </>
              )}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title="Send OTP"
              onPress={handleSubmit((v) => doLogin(v.phone))}
              loading={sending}
              fullWidth
              style={styles.cta}
            />
          </Card>

          <View style={styles.demoWrap}>
            <Text style={styles.demoLabel}>Demo access</Text>
            <Button
              title="Login as Owner (Raj)"
              variant="secondary"
              onPress={() => {
                setValue('phone', OWNER_DEMO_PHONE);
                doLogin(OWNER_DEMO_PHONE);
              }}
              fullWidth
            />
            <Button
              title="Login as Member (Priya)"
              variant="outline"
              onPress={() => {
                setValue('phone', MEMBER_DEMO_PHONE);
                doLogin(MEMBER_DEMO_PHONE);
              }}
              fullWidth
              style={styles.demoBtn}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.xl },
  formCard: { marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  cta: { marginTop: spacing.lg },
  demoWrap: { gap: spacing.sm },
  demoLabel: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs },
  demoBtn: { marginTop: 0 },
});
