import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAuthStore } from '../../store/authStore';
import { useCheckInStore } from '../../store/checkinStore';
import { memberIdFromSession } from '../../utils/session';
import { submitCheckIn } from '../../services/api/endpoints';
import { setSimulateOffline, isOfflineSimulated } from '../../services/api/client';
import { queryKeys } from '../../store/queryKeys';
import { formatDate } from '../../utils/format';
import { notifyStreakMilestone, STREAK_MILESTONES } from '../../services/notifications/notifications';

const GYM_QR_TEMPLATE = 'IFG|gym:gym-1|member:%s|ts:%d';

export function CheckInScreen() {
  const session = useAuthStore((s) => s.session);
  const memberId = memberIdFromSession(session);
  const qc = useQueryClient();
  const { pending, queueOffline, syncPending, lastResult, clearResult } = useCheckInStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [offlineMode, setOfflineMode] = useState(isOfflineSimulated());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!offlineMode && pending.length > 0) {
      syncPending().then((n) => {
        if (n > 0) {
          setSyncedCount(n);
          qc.invalidateQueries({ queryKey: queryKeys.dashboard });
          qc.invalidateQueries({ queryKey: queryKeys.attendance(memberId ?? 'none') });
          qc.invalidateQueries({ queryKey: queryKeys.memberProfile(memberId ?? 'none') });
        }
      });
    }
  }, [offlineMode, pending.length, syncPending, memberId, qc]);

  const handleScan = useCallback(
    async (qrPayload: string) => {
      if (scanned || submitting || !memberId || lastHandled.current === qrPayload) return;
      lastHandled.current = qrPayload;
      setScanned(true);
      setSubmitting(true);
      setError(null);
      try {
        const res = await submitCheckIn({ memberId, source: 'QR', qrPayload });
        useCheckInStore.setState({ lastResult: { streak: res.streak, message: res.message, memberName: res.memberName } });
        qc.invalidateQueries({ queryKey: queryKeys.attendance(memberId) });
        qc.invalidateQueries({ queryKey: queryKeys.memberProfile(memberId) });
        // PRD §13: celebrate streak milestones with a push notification
        if ((STREAK_MILESTONES as readonly number[]).includes(res.streak)) {
          notifyStreakMilestone(res.streak);
        }
      } catch (e) {
        if (offlineMode) {
          queueOffline({ memberId, gymId: 'gym-1', qrPayload, checkedInAt: new Date().toISOString() });
          useCheckInStore.setState({
            lastResult: { streak: 0, message: "Offline check-in saved — will sync when you're back online.", memberName: session?.user.name ?? '' },
          });
        } else {
          setError(e instanceof Error ? e.message : 'Check-in failed');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [scanned, submitting, memberId, offlineMode, queueOffline, session, qc],
  );

  const demoScan = () => {
    if (!memberId) return;
    handleScan(GYM_QR_TEMPLATE.replace('%s', memberId).replace('%d', String(Date.now())));
  };

  const toggleOffline = (v: boolean) => {
    setOfflineMode(v);
    setSimulateOffline(v);
    if (!v) {
      syncPending().then((n) => {
        if (n > 0) {
          setSyncedCount(n);
          qc.invalidateQueries({ queryKey: queryKeys.dashboard });
          qc.invalidateQueries({ queryKey: queryKeys.attendance(memberId ?? 'none') });
          qc.invalidateQueries({ queryKey: queryKeys.memberProfile(memberId ?? 'none') });
        }
      });
    }
  };

  const reset = () => {
    setScanned(false);
    setError(null);
    lastHandled.current = null;
    useCheckInStore.getState().clearResult();
    setSyncedCount(0);
  };

  const showResult = !!lastResult && !error;
  const todayStr = formatDate(new Date().toISOString(), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Screen title="Check-in" scroll={false}>
      <View style={styles.wrap}>
        {!showResult ? (
          <>
            <View style={styles.cameraWrap}>
              {permission?.granted ? (
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanned ? undefined : ({ data }) => handleScan(data)}
                >
                  <View style={styles.cameraOverlay}>
                    <Ionicons name="scan-outline" size={140} color="rgba(255,255,255,0.9)" />
                  </View>
                </CameraView>
              ) : (
                <View style={[styles.camera, styles.cameraFallback]}>
                  <Ionicons name="qr-code-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.cameraFallbackText}>Camera permission needed to scan QR codes</Text>
                  <Button
                    title={permission?.canAskAgain === false ? 'Open settings' : 'Grant permission'}
                    size="sm"
                    variant="secondary"
                    onPress={() => requestPermission()}
                  />
                </View>
              )}
            </View>
            <Text style={styles.scanHint}>Scan your gym's QR code to check in</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Card muted padded style={styles.demoCard}>
              <Text style={styles.demoTitle}>Demo controls</Text>
              <Button title="🎯 Simulate scanning gym QR" variant="primary" fullWidth onPress={demoScan} loading={submitting} />
              <View style={styles.offlineRow}>
                <View style={styles.offlineInfo}>
                  <Text style={styles.offlineLabel}>Simulate offline</Text>
                  <Text style={styles.offlineSub}>
                    {pending.length > 0 ? `${pending.length} pending offline check-in${pending.length === 1 ? '' : 's'} queued` : 'Queues check-ins locally (PRD §20)'}
                  </Text>
                </View>
                <Switch value={offlineMode} onValueChange={toggleOffline} trackColor={{ true: colors.brand }} />
              </View>
              {syncedCount > 0 ? <Text style={styles.synced}>{syncedCount} offline check-in{syncedCount === 1 ? '' : 's'} synced to server ✅</Text> : null}
            </Card>
          </>
        ) : (
          <Card style={styles.successCard}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>Check-in successful!</Text>
            {lastResult.streak > 0 ? (
              <Text style={styles.successStreak}>🔥 {lastResult.streak} Day Streak</Text>
            ) : null}
            <Text style={styles.successMeta}>
              {lastResult.memberName} · Today's attendance {todayStr}
            </Text>
            {pending.length > 0 ? (
              <Text style={styles.pendingNote}>
                {pending.length} offline check-in{pending.length === 1 ? '' : 's'} still waiting to sync
              </Text>
            ) : null}
            <Button title="Scan again" variant="outline" fullWidth onPress={reset} style={styles.scanAgain} />
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  cameraWrap: { height: 300, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.black },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.xl,
  },
  cameraFallbackText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  scanHint: { ...typography.captionStrong, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  error: { ...typography.captionStrong, color: colors.danger, textAlign: 'center', marginTop: spacing.md },
  demoCard: { marginTop: spacing.xl },
  demoTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.md },
  offlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  offlineInfo: { flex: 1 },
  offlineLabel: { ...typography.captionStrong, color: colors.text },
  offlineSub: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  synced: { ...typography.captionStrong, color: colors.success, marginTop: spacing.md },
  successCard: { alignItems: 'center', padding: spacing.xxl, marginTop: spacing.xl },
  successEmoji: { fontSize: 48 },
  successTitle: { ...typography.title, color: colors.text, marginTop: spacing.lg },
  successStreak: { ...typography.heading, color: colors.brand, marginTop: spacing.md },
  successMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  pendingNote: { ...typography.small, color: colors.warning, marginTop: spacing.sm, textAlign: 'center' },
  scanAgain: { marginTop: spacing.xl },
});
