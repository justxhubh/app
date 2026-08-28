// Core data model — PRD §18

export type Role = 'OWNER' | 'STAFF' | 'MEMBER';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: Role;
  gymId: string;
  createdAt: string;
}

export interface Gym {
  id: string;
  name: string;
  address: string;
  ownerId: string;
  timezone: string;
  createdAt: string;
}

export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SUSPENDED';

export interface Member {
  id: string;
  gymId: string;
  userId?: string;
  name: string;
  phone: string;
  email?: string;
  status: MemberStatus;
  lastCheckInAt: string | null;
  createdAt: string;
}

export type PlanType = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface MembershipPlan {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  durationDays: number;
}

export interface Membership {
  id: string;
  memberId: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  price: number;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  autoRenew: boolean;
}

export interface CheckIn {
  id: string;
  memberId: string;
  gymId: string;
  checkedInAt: string;
  source: 'QR' | 'MANUAL' | 'OFFLINE';
  deviceId?: string;
}

export type ServiceCategory = 'PT' | 'DIET' | 'SUPPLEMENT';

export interface Service {
  id: string;
  gymId: string;
  name: string;
  category: ServiceCategory;
  price: number;
  active: boolean;
}

export interface Sale {
  id: string;
  memberId: string;
  serviceId: string;
  amount: number;
  status: 'COMPLETED' | 'PENDING' | 'REFUNDED';
  createdAt: string;
}

// Business logic — PRD §19
export type RiskLevel = 'ACTIVE' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

// Gym-configurable at-risk thresholds (PRD §19: "the threshold should
// eventually become gym-configurable").
export interface RiskThresholds {
  activeMax: number; // 0–activeMax days absent -> Active 🟢
  watchMax: number; // activeMax+1 – watchMax -> Watch 🟡
  atRiskMax: number; // watchMax+1 – atRiskMax -> At Risk 🔴 (atRiskMax+1+ -> Critical 🚨)
}

export interface GymSettings {
  riskThresholds: RiskThresholds;
}

export interface RiskInfo {
  level: RiskLevel;
  daysInactive: number;
}

export interface MemberWithRisk extends Member {
  membership: Membership | null;
  risk: RiskInfo;
  monthlyAttendance: number;
  currentStreak: number;
}

// API DTOs

export interface AuthSession {
  user: User;
  gym: Gym;
  accessToken: string;
  refreshToken: string;
}

export interface DashboardSummary {
  activeMembers: number;
  atRiskCount: number;
  criticalCount: number;
  revenueAtRisk: number;
  renewalsExpected: number;
  renewalsDueToday: number;
  renewalsNext7Days: number;
  renewalsNext30Days: number;
  renewalsOverdue: number;
  addOnRevenue: number;
  addOnRevenueThisMonth: number;
  checkinsToday: number;
  checkinsThisWeek: number;
  checkinsThisMonth: number;
  weeklyTrend: number[];
  upcomingRenewals: UpcomingRenewal[];
  opportunities: OpportunitySummary;
}

export interface UpcomingRenewal {
  memberId: string;
  membershipId: string;
  memberName: string;
  planName: string;
  price: number;
  endDate: string;
  daysUntilExpiry: number;
  riskLevel: RiskLevel;
}

export type OpportunityType = ServiceCategory;

export interface OpportunitySummary {
  pt: { count: number; potential: number };
  diet: { count: number; potential: number };
  supplement: { count: number; potential: number };
}

export interface Opportunity {
  memberId: string;
  memberName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  category: OpportunityType;
  price: number;
  reason: string;
}

export interface TimelineEvent {
  id: string;
  type: 'CHECKIN' | 'PAYMENT' | 'RENEWAL' | 'SALE' | 'REMINDER';
  title: string;
  at: string;
  amount?: number;
}

export interface AttendanceSummary {
  memberId: string;
  thisMonth: number;
  attendanceRate: number; // 0-100
  currentStreak: number;
  bestStreak: number;
  last30Days: Record<string, boolean>;
}

export interface ReminderRequest {
  channel?: 'PUSH' | 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_APP';
}

export interface PendingCheckIn {
  localId: string;
  memberId: string;
  gymId: string;
  qrPayload: string;
  checkedInAt: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface NotificationItem {
  id: string;
  kind: 'risk' | 'renewal' | 'payment' | 'revenue' | 'streak' | 'milestone';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
