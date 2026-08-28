import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { MemberTabParamList } from './types';
import { MemberHomeScreen } from '../../features/attendance/MemberHomeScreen';
import { CheckInScreen } from '../../features/checkin/CheckInScreen';
import { ProgressScreen } from '../../features/attendance/ProgressScreen';
import { MemberProfileScreen } from '../../features/profile/MemberProfileScreen';

const Tab = createBottomTabNavigator<MemberTabParamList>();

const ICONS: Record<keyof MemberTabParamList, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  MemberHomeTab: ['home-outline', 'home'],
  CheckInTab: ['qr-code-outline', 'qr-code'],
  ProgressTab: ['stats-chart-outline', 'stats-chart'],
  MemberProfileTab: ['person-outline', 'person'],
};

export function MemberNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const [outline, filled] = ICONS[route.name];
          return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="MemberHomeTab" component={MemberHomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="CheckInTab" component={CheckInScreen} options={{ title: 'Check-in' }} />
      <Tab.Screen name="ProgressTab" component={ProgressScreen} options={{ title: 'Progress' }} />
      <Tab.Screen name="MemberProfileTab" component={MemberProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
