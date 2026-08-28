import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RiskLevel, ServiceCategory } from '../../types';

export type OwnerTabParamList = {
  DashboardTab: undefined;
  MembersTab: undefined;
  RenewalsTab: undefined;
  RevenueTab: undefined;
};

export type MemberTabParamList = {
  MemberHomeTab: undefined;
  CheckInTab: undefined;
  ProgressTab: undefined;
  MemberProfileTab: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Otp: { phone: string };
  OwnerTabs: NavigatorScreenParams<OwnerTabParamList> | undefined;
  MemberTabs: NavigatorScreenParams<MemberTabParamList> | undefined;
  MemberProfile: { memberId: string };
  AtRisk: { filter?: RiskLevel | 'renewal' | 'overdue' } | undefined;
  Opportunities: { category?: ServiceCategory } | undefined;
  Services: undefined;
  Notifications: undefined;
  Settings: undefined;
};
