import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../../theme';
import type { RootStackParamList } from './types';
import { useAuthStore, isOwner } from '../../store/authStore';
import { LoginScreen } from '../../features/auth/LoginScreen';
import { OtpScreen } from '../../features/auth/OtpScreen';
import { OwnerNavigator } from './OwnerNavigator';
import { MemberNavigator } from './MemberNavigator';
import { MemberProfileScreen } from '../../features/members/MemberProfileScreen';
import { AtRiskScreen } from '../../features/members/AtRiskScreen';
import { OpportunitiesScreen } from '../../features/revenue/OpportunitiesScreen';
import { ServicesScreen } from '../../features/revenue/ServicesScreen';
import { NotificationsScreen } from '../../features/notifications/NotificationsScreen';
import { OwnerSettingsScreen } from '../../features/settings/OwnerSettingsScreen';
import { FullScreenLoading } from '../../components/Loading';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);

  if (status === 'idle' || status === 'restoring') {
    return <FullScreenLoading label="Restoring session…" />;
  }

  const authenticated = status === 'authenticated' && session;
  const owner = isOwner(session);

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {!authenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Otp" component={OtpScreen} options={{ title: '' }} />
        </>
      ) : owner ? (
        <>
          <Stack.Screen name="OwnerTabs" component={OwnerNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="MemberProfile" component={MemberProfileScreen} options={{ title: 'Member Profile', headerBackTitle: 'Back' }} />
          <Stack.Screen name="AtRisk" component={AtRiskScreen} options={{ title: 'At-Risk Members' }} />
          <Stack.Screen name="Opportunities" component={OpportunitiesScreen} options={{ title: 'Opportunities' }} />
          <Stack.Screen name="Services" component={ServicesScreen} options={{ title: 'Services & Catalogue' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          <Stack.Screen name="Settings" component={OwnerSettingsScreen} options={{ title: 'Settings' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="MemberTabs" component={MemberNavigator} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
