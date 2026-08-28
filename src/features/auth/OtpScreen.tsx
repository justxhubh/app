import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { TextInput } from '../../components/TextInput';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../app/navigation/types';
import { useAuthStore } from '../../store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

export function OtpScreen({ route, navigation }: Props) {
  const { phone } = route.params;
  const { login, sendOtp } = useAuthStore();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(30);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const submit = async () => {
    if (otp.length !== 4) {
      setError('Enter the 4-digit OTP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(phone, otp);
      // RootNavigator switches to the correct role app on session change
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResendIn(30);
    await sendOtp(phone);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.subtitle}>
          A 4-digit code was sent to +91 {phone}
        </Text>

        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>OTP</Text>
          <TextInput
            value={otp}
            onChangeText={(t) => {
              setOtp(t.replace(/[^0-9]/g, '').slice(0, 4));
              setError(null);
            }}
            placeholder="4-digit OTP"
            keyboardType="number-pad"
            error={error ?? undefined}
          />
          {__DEV__ ? (
            <Text style={styles.hint}>Demo OTP: 1234</Text>
          ) : null}
          <Button title="Verify & Continue" onPress={submit} loading={loading} fullWidth style={styles.cta} />
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive it?</Text>
            <Button
              title={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
              variant="ghost"
              size="sm"
              disabled={resendIn > 0}
              onPress={resend}
            />
          </View>
        </Card>

        <Button title="Change number" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  card: { marginTop: spacing.xl },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm },
  hint: { ...typography.small, color: colors.success, marginTop: spacing.sm },
  cta: { marginTop: spacing.lg },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  resendLabel: { ...typography.caption, color: colors.textSecondary },
});
