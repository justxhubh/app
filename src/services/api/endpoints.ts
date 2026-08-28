// Typed API surface — mirrors PRD §17.

import type {
  AttendanceSummary,
  AuthSession,
  CheckIn,
  DashboardSummary,
  GymSettings,
  MemberWithRisk,
  NotificationItem,
  Opportunity,
  ReminderRequest,
  RiskThresholds,
  Sale,
  Service,
  ServiceCategory,
  TimelineEvent,
  UpcomingRenewal,
  Membership,
  Member,
  RiskLevel,
} from '../../types';
import { del, get, patch, post } from './client';

// ---------- Auth ----------

export const sendOtp = (phone: string) =>
  post<{ ok: boolean; otp: string; message: string }>('/auth/send-otp', { phone });

export const verifyOtp = (phone: string, otp: string) =>
  post<AuthSession>('/auth/verify-otp', { phone, otp });

export const refreshSession = (refreshToken: string) =>
  post<AuthSession>('/auth/refresh', { refreshToken });

export const logout = () => post<{ ok: boolean }>('/auth/logout');

// ---------- Dashboard ----------

export const fetchDashboardSummary = () => get<DashboardSummary>('/dashboard/summary');

export const fetchRiskSummary = () =>
  get<{ active: number; watch: number; atRisk: number; critical: number }>('/dashboard/risk-summary');

// ---------- Settings (gym-configurable risk thresholds, PRD §19) ----------

export const fetchGymSettings = () => get<GymSettings>('/settings');

export const updateRiskThresholds = (riskThresholds: RiskThresholds) =>
  patch<{ ok: boolean; riskThresholds: RiskThresholds }>('/settings', { riskThresholds });

// ---------- Members ----------

export interface MemberListQuery {
  search?: string;
  risk?: RiskLevel | '';
  status?: string;
  sort?: 'risk' | 'name' | 'renewal';
}

export const fetchMembers = (q: MemberListQuery = {}) =>
  get<{ members: MemberWithRisk[] }>('/members', {
    search: q.search,
    risk: q.risk,
    status: q.status,
    sort: q.sort,
  });

export const fetchAtRiskMembers = () =>
  get<{ members: MemberWithRisk[] }>('/members/at-risk');

export const fetchMemberProfile = (id: string) =>
  get<{
    member: MemberWithRisk;
    membership: Membership | null;
    timeline: TimelineEvent[];
    opportunities: { pt: boolean; diet: boolean; supplement: boolean };
  }>(`/members/${id}`);

export const updateMember = (id: string, body: { status?: string; name?: string; phone?: string }) =>
  patch<{ ok: boolean; member: MemberWithRisk }>(`/members/${id}`, body);

// ---------- Attendance / check-in ----------

export const fetchAttendance = (memberId: string) =>
  get<AttendanceSummary>(`/members/${memberId}/attendance`);

export const fetchAttendanceSummary = () =>
  get<{ today: number; week: number; month: number; averagePerMember: number }>('/attendance/summary');

export interface CheckInResult {
  checkIn: CheckIn;
  streak: number;
  memberName: string;
  message: string;
}

export const submitCheckIn = (body: {
  memberId: string;
  source?: CheckIn['source'];
  qrPayload?: string;
}) => post<CheckInResult>('/checkins', body);

// ---------- Renewals ----------

export interface RenewalRow extends Membership {
  memberName: string;
  memberPhone: string;
  daysUntilExpiry: number;
  riskLevel: RiskLevel;
}

export const fetchRenewals = () =>
  get<{ renewals: RenewalRow[]; expected: number }>('/renewals');

export const sendReminder = (membershipId: string, opts: ReminderRequest = {}) =>
  post<{ ok: boolean; message: string }>(`/renewals/${membershipId}/remind`, {
    ...(opts.channel ? { channel: opts.channel } : {}),
  });

export const renewMembership = (membershipId: string, days?: number) =>
  post<{ ok: boolean; message: string; membership: Membership }>(
    `/renewals/${membershipId}/renew`,
    days ? { days } : undefined,
  );

// ---------- Revenue ----------

export const fetchRevenueSummary = () =>
  get<{
    totalRevenue: number;
    thisMonth: number;
    pt: number;
    diet: number;
    supplement: number;
    sales: (Sale & { memberName: string; serviceName: string })[];
  }>('/revenue/summary');

export const fetchOpportunities = (category?: ServiceCategory) =>
  get<{ opportunities: Opportunity[]; summary: { pt: { count: number; potential: number }; diet: { count: number; potential: number }; supplement: { count: number; potential: number } } }>(
    '/revenue/opportunities',
    { category },
  );

export const fetchServices = () => get<{ services: Service[] }>('/services');

export const createService = (body: { name: string; category: ServiceCategory; price: number }) =>
  post<{ service: Service }>('/services', body);

export const recordSale = (memberId: string, serviceId: string) =>
  post<{ sale: Sale; message: string }>('/sales', { memberId, serviceId });

// ---------- Notifications ----------

export const fetchNotifications = () =>
  get<{ notifications: NotificationItem[] }>('/notifications');

export const markNotificationRead = (id: string) =>
  post<{ ok: boolean }>('/notifications/read', { id });
