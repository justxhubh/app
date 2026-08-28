import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { OwnerTabParamList } from './types';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { MembersScreen } from '../../features/members/MembersScreen';
import { RenewalsScreen } from '../../features/renewals/RenewalsScreen';
import { RevenueScreen } from '../../features/revenue/RevenueScreen';

const Tab = createBottomTabNavigator<OwnerTabParamList>();

const ICONS: Record<keyof OwnerTabParamList, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  DashboardTab: ['speedometer-outline', 'speedometer'],
  MembersTab: ['people-outline', 'people'],
  RenewalsTab: ['calendar-outline', 'calendar'],
  RevenueTab: ['wallet-outline', 'wallet'],
};

export function OwnerNavigator() {
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
      <Tab.Screen name="DashboardTab" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="MembersTab" component={MembersScreen} options={{ title: 'Members' }} />
      <Tab.Screen name="RenewalsTab" component={RenewalsScreen} options={{ title: 'Renewals' }} />
      <Tab.Screen name="RevenueTab" component={RevenueScreen} options={{ title: 'Revenue' }} />
    </Tab.Navigator>
  );
}
