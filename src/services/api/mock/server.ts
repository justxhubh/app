// Mock backend server — routes the endpoints from PRD §17 and
// implements the business logic from §12, §19 and §23.

import type {
  AuthSession,
  AttendanceSummary,
  CheckIn,
  DashboardSummary,
  Member,
  MemberWithRisk,
  NotificationItem,
  Opportunity,
  RiskLevel,
  Sale,
  Service,
  ServiceCategory,
  TimelineEvent,
  UpcomingRenewal,
  User,
} from '../../../types';
import { db, getMember, getMembership, getService } from './db';
import { computeRisk, isRisking, RISK_META, DEFAULT_RISK_THRESHOLDS } from '../../../utils/risk';
import type { RiskThresholds } from '../../../types';
import {
  addDays,
  daysSince,
  daysUntil,
  formatDate,
  isSameDay,
  isWithinDays,
  monthKey,
} from '../../../utils/format';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RequestContext {
  token?: string | null;
}

// ---------- Session / auth ----------

const TOKEN_OWNER = 'mock-token-owner';
const TOKEN_MEMBER_PREFIX = 'mock-token-member-';

interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

function sessionFor(user: User): Session {
  // Member users are keyed as `u-<memberId>`; the token must encode the raw
  // member id so requireAuth() can look the member up.
  const memberId = user.role !== 'OWNER' && user.id.startsWith('u-') ? user.id.slice(2) : user.id;
  return {
    user,
    accessToken: user.role === 'OWNER' ? TOKEN_OWNER : `${TOKEN_MEMBER_PREFIX}${memberId}`,
    refreshToken: `refresh-${user.role === 'OWNER' ? 'owner' : memberId}`,
  };
}

function memberUser(member: Member): User {
  return {
    id: `u-${member.id}`,
    name: member.name,
    phone: member.phone,
    email: member.email,
    role: 'MEMBER',
    gymId: db.gym.id,
    createdAt: member.createdAt,
  };
}

function requireAuth(ctx: RequestContext): User {
  if (!ctx.token) throw new ApiError(401, 'Not authenticated');
  if (ctx.token === TOKEN_OWNER) return db.owner;
  if (ctx.token.startsWith(TOKEN_MEMBER_PREFIX)) {
    const member = db.members.find((m) => m.id === ctx.token!.replace(TOKEN_MEMBER_PREFIX, ''));
    if (member) return memberUser(member);
  }
  throw new ApiError(401, 'Invalid token');
}

function requireOwner(ctx: RequestContext): User {
  const user = requireAuth(ctx);
  if (user.role !== 'OWNER') throw new ApiError(403, 'Owner access required');
  return user;
}

// ---------- Derived business logic ----------

function attendanceDays(memberId: string, withinDays: number): number {
  const since = addDays(new Date().toISOString(), -withinDays);
  return db.checkIns.filter(
    (c) => c.memberId === memberId && c.checkedInAt >= since,
  ).length;
}

function currentStreak(memberId: string): number {
  const cins = db.checkIns
    .filter((c) => c.memberId === memberId)
    .map((c) => c.checkedInAt.slice(0, 10))
    .sort((a, b) => (a < b ? 1 : -1));
  if (cins.length === 0) return 0;
  const set = new Set(cins);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1).slice(0, 10);
  let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;
  let streak = 0;
  while (cursor) {
    streak++;
    cursor = addDays(cursor, -1).slice(0, 10);
    if (!set.has(cursor)) break;
  }
  return streak;
}

// Risk is computed against the gym's configured thresholds (PRD §19).
function riskFor(m: Member) {
  return computeRisk(m.lastCheckInAt, db.riskThresholds);
}

function withRisk(m: Member): MemberWithRisk {
  const membership = getMembership(m.id);
  const risk = riskFor(m);
  return {
    ...m,
    membership: membership ?? null,
    risk,
    monthlyAttendance: attendanceDays(m.id, 30),
    currentStreak: currentStreak(m.id),
  };
}

function allMembersWithRisk(): MemberWithRisk[] {
  return db.members.map(withRisk);
}

function timelineFor(memberId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const c of db.checkIns.filter((c) => c.memberId === memberId)) {
    events.push({ id: `e-${c.id}`, type: 'CHECKIN', title: 'Check-in', at: c.checkedInAt });
  }
  const mem = getMembership(memberId);
  if (mem) {
    events.push({ id: `e-mem-${mem.id}`, type: 'PAYMENT', title: `Payment · ${mem.planName}`, at: mem.startDate, amount: mem.price });
    events.push({ id: `e-renew-${mem.id}`, type: 'RENEWAL', title: 'Membership renewed', at: mem.startDate, amount: mem.price });
  }
  for (const s of db.sales.filter((s) => s.memberId === memberId)) {
    const svc = getService(s.serviceId);
    events.push({ id: `e-sale-${s.id}`, type: 'SALE', title: `Purchased ${svc?.name ?? 'service'}`, at: s.createdAt, amount: s.amount });
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function hasPurchased(memberId: string, category: ServiceCategory): boolean {
  return db.sales.some((s) => {
    if (s.memberId !== memberId) return false;
    const svc = getService(s.serviceId);
    return svc?.category === category;
  });
}

// PRD §12 — rule-based opportunity engine
function computeOpportunities(): Opportunity[] {
  const out: Opportunity[] = [];
  for (const m of db.members) {
    if (m.status !== 'ACTIVE') continue;
    const mem = getMembership(m.id);
    if (!mem || mem.status !== 'ACTIVE') continue;
    const risk = riskFor(m);
    if (risk.level === 'AT_RISK' || risk.level === 'CRITICAL') continue;
    const rate = attendanceDays(m.id, 30);

    if (!hasPurchased(m.id, 'PT')) {
      const svc = db.services.find((s) => s.category === 'PT' && s.active);
      if (svc && rate >= 8) {
        out.push({
          memberId: m.id,
          memberName: m.name,
          phone: m.phone,
          serviceId: svc.id,
          serviceName: svc.name,
          category: 'PT',
          price: svc.price,
          reason: 'Active member, high attendance, no PT package',
        });
      }
    }
    if (!hasPurchased(m.id, 'DIET')) {
      const svc = db.services.find((s) => s.category === 'DIET' && s.active);
      if (svc) {
        out.push({
          memberId: m.id,
          memberName: m.name,
          phone: m.phone,
          serviceId: svc.id,
          serviceName: svc.name,
          category: 'DIET',
          price: svc.price,
          reason: 'Active member without a diet plan',
        });
      }
    }
    if (!hasPurchased(m.id, 'SUPPLEMENT')) {
      const svc = db.services.find((s) => s.category === 'SUPPLEMENT' && s.active);
      if (svc) {
        out.push({
          memberId: m.id,
          memberName: m.name,
          phone: m.phone,
          serviceId: svc.id,
          serviceName: svc.name,
          category: 'SUPPLEMENT',
          price: svc.price,
          reason: 'Active member eligible for supplement add-on',
        });
      }
    }
  }
  return out;
}

function opportunitySummary() {
  const opts = computeOpportunities();
  const sum = (cat: ServiceCategory) => {
    const list = opts.filter((o) => o.category === cat);
    return { count: list.length, potential: list.reduce((a, o) => a + o.price, 0) };
  };
  return { pt: sum('PT'), diet: sum('DIET'), supplement: sum('SUPPLEMENT') };
}

function upcomingRenewals(): UpcomingRenewal[] {
  const list: UpcomingRenewal[] = [];
  for (const mem of db.memberships) {
    const days = daysUntil(mem.endDate);
    if (days < 0 || days > 30) continue;
    const member = getMember(mem.memberId);
    if (!member) continue;
    list.push({
      memberId: member.id,
      membershipId: mem.id,
      memberName: member.name,
      planName: mem.planName,
      price: mem.price,
      endDate: mem.endDate,
      daysUntilExpiry: days,
      riskLevel: riskFor(member).level,
    });
  }
  return list.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

function dashboardSummary(): DashboardSummary {
  const members = db.members;
  const active = members.filter((m) => m.status === 'ACTIVE');
  const risked = members.map(withRisk).filter((m) => isRisking(m.risk.level));
  const revenueAtRisk = risked.reduce((sum, m) => sum + (m.membership?.price ?? 0), 0);

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekAgo = addDays(todayKey, -7);
  const monthAgo = addDays(todayKey, -30);

  const checkinsToday = db.checkIns.filter((c) => c.checkedInAt.slice(0, 10) === todayKey).length;
  const checkinsThisWeek = db.checkIns.filter((c) => c.checkedInAt >= weekAgo).length;
  const checkinsThisMonth = db.checkIns.filter((c) => c.checkedInAt >= monthAgo).length;

  // 7-day trend (Mon..Sun style: last 7 days)
  const weeklyTrend: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const key = addDays(todayKey, -d).slice(0, 10);
    weeklyTrend.push(db.checkIns.filter((c) => c.checkedInAt.slice(0, 10) === key).length);
  }

  const renewals = upcomingRenewals();
  const month = monthKey(now);
  const addOnThisMonth = db.sales
    .filter((s) => s.status === 'COMPLETED' && monthKey(new Date(s.createdAt)) === month)
    .reduce((a, s) => a + s.amount, 0);

  const membershipMonth = db.memberships.filter((m) => daysUntil(m.endDate) >= 0 && daysUntil(m.endDate) <= 30);

  return {
    activeMembers: active.length,
    atRiskCount: risked.filter((m) => m.risk.level === 'AT_RISK').length,
    criticalCount: risked.filter((m) => m.risk.level === 'CRITICAL').length,
    revenueAtRisk,
    renewalsExpected: membershipMonth.reduce((a, m) => a + m.price, 0),
    renewalsDueToday: renewals.filter((r) => r.daysUntilExpiry === 0).length,
    renewalsNext7Days: renewals.filter((r) => r.daysUntilExpiry <= 7).length,
    renewalsNext30Days: renewals.length,
    renewalsOverdue: db.memberships.filter((m) => m.status === 'EXPIRED').length,
    addOnRevenue: db.sales.filter((s) => s.status === 'COMPLETED').reduce((a, s) => a + s.amount, 0),
    addOnRevenueThisMonth: addOnThisMonth,
    checkinsToday,
    checkinsThisWeek,
    checkinsThisMonth,
    weeklyTrend,
    upcomingRenewals: renewals.slice(0, 5),
    opportunities: opportunitySummary(),
  };
}

// ---------- Router ----------

type RouteHandler = (
  params: Record<string, unknown>,
  ctx: RequestContext,
  body?: Record<string, unknown>,
) => unknown;

const ROUTES: Record<string, RouteHandler> = {
  // Auth
  'POST /auth/send-otp': (b: Record<string, unknown>) => {
    const phone = String(b.phone ?? '');
    if (!/^[6-9]\d{9}$/.test(phone)) throw new ApiError(400, 'Invalid phone number');
    const otp = '1234'; // demo OTP
    db.otps[phone] = otp;
    return { ok: true, otp, message: 'OTP sent (demo: 1234)' };
  },
  'POST /auth/verify-otp': (b: Record<string, unknown>) => {
    const phone = String(b.phone ?? '');
    const otp = String(b.otp ?? '');
    if (db.otps[phone] && db.otps[phone] !== otp) throw new ApiError(400, 'Invalid OTP');
    if (phone === db.owner.phone) return sessionFor(db.owner);
    const member = db.members.find((m) => m.phone === phone);
    if (member) return sessionFor(memberUser(member));
    throw new ApiError(404, 'No account found for this phone. Use demo numbers.');
  },
  'POST /auth/refresh': (b: Record<string, unknown>) => {
    const rt = String(b.refreshToken ?? '');
    if (rt.startsWith('refresh-owner')) return sessionFor(db.owner);
    const member = db.members.find((m) => rt === `refresh-${m.id}`);
    if (member) return sessionFor(memberUser(member));
    throw new ApiError(401, 'Invalid refresh token');
  },
  'POST /auth/logout': () => ({ ok: true }),

  // Dashboard
  'GET /dashboard/summary': (_b, ctx) => {
    requireOwner(ctx);
    return dashboardSummary();
  },
  'GET /dashboard/risk-summary': (_b, ctx) => {
    requireOwner(ctx);
    const all = allMembersWithRisk();
    return {
      active: all.filter((m) => m.risk.level === 'ACTIVE').length,
      watch: all.filter((m) => m.risk.level === 'WATCH').length,
      atRisk: all.filter((m) => m.risk.level === 'AT_RISK').length,
      critical: all.filter((m) => m.risk.level === 'CRITICAL').length,
    };
  },

  // Gym settings — configurable risk thresholds (PRD §19)
  'GET /settings': (_b, ctx) => {
    requireOwner(ctx);
    return { riskThresholds: { ...db.riskThresholds } };
  },
  'PATCH /settings': (b, ctx) => {
    requireOwner(ctx);
    const t = b.riskThresholds as Partial<RiskThresholds> | undefined;
    if (!t) throw new ApiError(400, 'riskThresholds required');
    const next: RiskThresholds = {
      activeMax: t.activeMax ?? db.riskThresholds.activeMax,
      watchMax: t.watchMax ?? db.riskThresholds.watchMax,
      atRiskMax: t.atRiskMax ?? db.riskThresholds.atRiskMax,
    };
    const ok = [next.activeMax, next.watchMax, next.atRiskMax].every(
      (v) => Number.isInteger(v) && v >= 0,
    );
    if (!ok || !(next.activeMax < next.watchMax && next.watchMax < next.atRiskMax)) {
      throw new ApiError(400, 'Thresholds must be whole numbers and strictly increasing: active < watch < at risk');
    }
    db.riskThresholds = next;
    return { ok: true, riskThresholds: { ...next } };
  },

  // Members
  'GET /members': (b, ctx) => {
    requireOwner(ctx);
    const search = String(b.search ?? '').toLowerCase();
    const risk = String(b.risk ?? '');
    const status = String(b.status ?? '');
    let list = allMembersWithRisk();
    if (search) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(search) ||
          m.phone.includes(search) ||
          m.id.toLowerCase().includes(search),
      );
    }
    if (risk) list = list.filter((m) => m.risk.level === risk);
    if (status) list = list.filter((m) => m.status === status);
    const sort = String(b.sort ?? 'risk');
    if (sort === 'risk') list.sort((a, b) => RISK_META[b.risk.level].order - RISK_META[a.risk.level].order);
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'renewal') list.sort((a, b) => (a.membership ? daysUntil(a.membership.endDate) : 999) - (b.membership ? daysUntil(b.membership.endDate) : 999));
    return { members: list };
  },
  'GET /members/at-risk': (_b, ctx) => {
    requireOwner(ctx);
    return {
      members: allMembersWithRisk().filter((m) => m.risk.level === 'AT_RISK' || m.risk.level === 'CRITICAL'),
    };
  },
  'GET /members/:id': (b, ctx) => {
    const user = requireAuth(ctx);
    const id = String(b.id);
    // Members may read their own profile; owners may read any member's.
    if (user.role !== 'OWNER' && user.id !== `u-${id}`) throw new ApiError(403, 'Forbidden');
    const m = getMember(id);
    if (!m) throw new ApiError(404, 'Member not found');
    const membership = getMembership(m.id) ?? null;
    return {
      member: withRisk(m),
      membership,
      timeline: timelineFor(m.id),
      opportunities: {
        pt: !hasPurchased(m.id, 'PT'),
        diet: !hasPurchased(m.id, 'DIET'),
        supplement: !hasPurchased(m.id, 'SUPPLEMENT'),
      },
    };
  },
  'PATCH /members/:id': (b, ctx) => {
    requireOwner(ctx);
    const m = getMember(String(b.id));
    if (!m) throw new ApiError(404, 'Member not found');
    if (typeof b.status === 'string') m.status = b.status as Member['status'];
    if (typeof b.name === 'string') m.name = b.name;
    if (typeof b.phone === 'string') m.phone = b.phone;
    return { ok: true, member: withRisk(m) };
  },

  // Attendance & check-in
  'GET /members/:id/attendance': (b, ctx) => {
    const user = requireAuth(ctx);
    const memberId = String(b.id);
    if (user.role !== 'OWNER' && user.id !== `u-${memberId}`) throw new ApiError(403, 'Forbidden');
    const member = getMember(memberId);
    if (!member) throw new ApiError(404, 'Member not found');
    const last30: Record<string, boolean> = {};
    const today = new Date();
    for (let d = 29; d >= 0; d--) {
      const key = addDays(today.toISOString(), -d).slice(0, 10);
      last30[key] = db.checkIns.some((c) => c.memberId === memberId && c.checkedInAt.slice(0, 10) === key);
    }
    const thisMonth = attendanceDays(memberId, 30);
    const summary: AttendanceSummary = {
      memberId,
      thisMonth,
      attendanceRate: Math.min(100, Math.round((thisMonth / 30) * 100)),
      currentStreak: currentStreak(memberId),
      bestStreak: 0,
      last30Days: last30,
    };
    // best streak from history
    const keys = Object.keys(last30).sort();
    let best = 0;
    let run = 0;
    for (const k of keys) {
      if (last30[k]) {
        run++;
        best = Math.max(best, run);
      } else run = 0;
    }
    summary.bestStreak = Math.max(best, summary.currentStreak);
    return summary;
  },
  'GET /attendance/summary': (_b, ctx) => {
    requireOwner(ctx);
    return {
      today: attendanceToday(),
      week: attendanceWeek(),
      month: attendanceMonth(),
      averagePerMember: Math.round((attendanceMonth() / Math.max(1, db.members.length)) * 10) / 10,
    };
  },
  'POST /checkins': (b, ctx) => {
    const user = requireAuth(ctx);
    const memberId = String(b.memberId ?? '');
    const qrPayload = String(b.qrPayload ?? '');
    const member = getMember(memberId);
    if (!member) throw new ApiError(404, 'Member not found');

    // QR validation — PRD §7: payload must contain the gym id + signed token
    if (qrPayload && !qrPayload.includes(`gym:${db.gym.id}`)) {
      throw new ApiError(400, 'Invalid or expired QR code');
    }

    // Duplicate protection — 30 minute window
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const dup = db.checkIns.find(
      (c) => c.memberId === memberId && c.checkedInAt >= cutoff,
    );
    if (dup) {
      throw new ApiError(409, `Already checked in at ${new Date(dup.checkedInAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Try again later.`);
    }

    const checkIn: CheckIn = {
      id: `ci-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      memberId,
      gymId: db.gym.id,
      checkedInAt: new Date().toISOString(),
      source: (b.source as CheckIn['source']) ?? 'QR',
    };
    db.checkIns.push(checkIn);
    member.lastCheckInAt = checkIn.checkedInAt;

    const streak = currentStreak(memberId);
    if (streak === 7 || streak === 14 || streak === 30) {
      pushNotification({
        kind: 'streak',
        title: `🔥 ${streak}-day streak!`,
        body: `${member.name} is on a ${streak}-day streak. Keep it going!`,
      });
    }

    return {
      checkIn,
      streak,
      memberName: member.name,
      message: `Check-in recorded · ${formatDate(checkIn.checkedInAt, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    };
  },

  // Renewals
  'GET /renewals': (_b, ctx) => {
    requireOwner(ctx);
    const list = db.memberships
      .map((mem) => {
        const member = getMember(mem.memberId);
        return { ...mem, memberName: member?.name ?? 'Unknown', memberPhone: member?.phone ?? '', daysUntilExpiry: daysUntil(mem.endDate), riskLevel: member ? riskFor(member).level : 'ACTIVE' };
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    return { renewals: list, expected: list.filter((r) => r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30).reduce((a, r) => a + r.price, 0) };
  },
  'POST /renewals/:id/remind': (b, ctx) => {
    requireOwner(ctx);
    const mem = db.memberships.find((m) => m.id === String(b.id));
    if (!mem) throw new ApiError(404, 'Membership not found');
    const member = getMember(mem.memberId);
    pushNotification({
      kind: 'renewal',
      title: `Reminder sent to ${member?.name}`,
      body: `Renewal reminder sent · ${mem.planName} · ${formatDate(mem.endDate)}`,
    });
    return { ok: true, message: 'Reminder sent' };
  },
  'POST /renewals/:id/renew': (b, ctx) => {
    requireOwner(ctx);
    const mem = db.memberships.find((m) => m.id === String(b.id));
    if (!mem) throw new ApiError(404, 'Membership not found');
    const plan = db.plans.find((p) => p.id === mem.planId) ?? db.plans[0];
    const days = b.days && typeof b.days === 'number' ? b.days : plan.durationDays;
    mem.startDate = new Date().toISOString();
    mem.endDate = addDays(mem.startDate, days);
    mem.status = 'ACTIVE';
    const member = getMember(mem.memberId);
    if (member) member.status = 'ACTIVE';
    pushNotification({ kind: 'renewal', title: `${member?.name} renewed`, body: `${mem.planName} renewed for ${days} days` });
    return { ok: true, membership: mem, message: 'Membership renewed' };
  },

  // Revenue
  'GET /revenue/summary': (_b, ctx) => {
    requireOwner(ctx);
    const completed = db.sales.filter((s) => s.status === 'COMPLETED');
    const now = new Date();
    const thisMonth = completed.filter((s) => monthKey(new Date(s.createdAt)) === monthKey(now));
    const byCategory = (cat: ServiceCategory) =>
      completed.filter((s) => getService(s.serviceId)?.category === cat).reduce((a, s) => a + s.amount, 0);
    return {
      totalRevenue: completed.reduce((a, s) => a + s.amount, 0),
      thisMonth: thisMonth.reduce((a, s) => a + s.amount, 0),
      pt: byCategory('PT'),
      diet: byCategory('DIET'),
      supplement: byCategory('SUPPLEMENT'),
      sales: completed
        .map((s) => ({
          ...s,
          memberName: getMember(s.memberId)?.name ?? 'Unknown',
          serviceName: getService(s.serviceId)?.name ?? 'Service',
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 25),
    };
  },
  'GET /revenue/opportunities': (b, ctx) => {
    requireOwner(ctx);
    const cat = String(b.category ?? '');
    let opts = computeOpportunities();
    if (cat) opts = opts.filter((o) => o.category === cat);
    return { opportunities: opts, summary: opportunitySummary() };
  },
  'GET /services': (_b, ctx) => {
    requireOwner(ctx);
    return { services: db.services };
  },
  'POST /services': (b, ctx) => {
    requireOwner(ctx);
    const { name, category, price } = b as { name?: string; category?: ServiceCategory; price?: number };
    if (!name || !category || typeof price !== 'number') throw new ApiError(400, 'name, category and price required');
    const svc: Service = { id: `svc-${Date.now()}`, gymId: db.gym.id, name, category, price, active: true };
    db.services.push(svc);
    return { service: svc };
  },
  'POST /sales': (b, ctx) => {
    requireOwner(ctx);
    const { memberId, serviceId } = b as { memberId?: string; serviceId?: string };
    if (!memberId || !serviceId) throw new ApiError(400, 'memberId and serviceId required');
    const svc = getService(serviceId);
    if (!svc) throw new ApiError(404, 'Service not found');
    const sale: Sale = {
      id: `sale-${Date.now()}`,
      memberId,
      serviceId,
      amount: svc.price,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };
    db.sales.push(sale);
    const member = getMember(memberId);
    pushNotification({
      kind: 'revenue',
      title: `Sale recorded · ${svc.name}`,
      body: `${member?.name ?? 'Member'} purchased ${svc.name} for ₹${svc.price}`,
    });
    return { sale, message: 'Sale recorded' };
  },

  // Notifications
  'GET /notifications': () => ({ notifications: [...notificationStore] }),
  'POST /notifications/read': (b) => {
    const id = String(b.id ?? '');
    const item = notificationStore.find((n) => n.id === id);
    if (item) item.read = true;
    return { ok: true };
  },
} as const;

// ---------- In-app notifications (PRD §13) ----------

const notificationStore: NotificationItem[] = [];

function pushNotification(item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>): void {
  notificationStore.unshift({
    ...item,
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    read: false,
  });
}

// ---------- Attendance aggregation helpers ----------

function attendanceToday(): number {
  const key = new Date().toISOString().slice(0, 10);
  return db.checkIns.filter((c) => c.checkedInAt.slice(0, 10) === key).length;
}
function attendanceWeek(): number {
  return db.checkIns.filter((c) => c.checkedInAt >= addDays(new Date().toISOString(), -7)).length;
}
function attendanceMonth(): number {
  return db.checkIns.filter((c) => c.checkedInAt >= addDays(new Date().toISOString(), -30)).length;
}

// ---------- Entry point ----------

export async function handleRequest(
  method: string,
  rawPath: string,
  body: Record<string, unknown> | undefined,
  ctx: RequestContext,
): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 350)); // simulated latency

  const [path, query] = rawPath.split('?');
  const qs = new URLSearchParams(query ?? '');
  const params: Record<string, string> = {};
  for (const key of qs.keys()) params[key] = qs.get(key) ?? '';
  const routeBody = body ?? {};

  const segments = path.split('/').filter(Boolean);
  for (const [key, handler] of Object.entries(ROUTES)) {
    const [m, routePath] = key.split(' ');
    if (m !== method) continue;
    const routeSegs = routePath.split('/').filter(Boolean);
    if (routeSegs.length !== segments.length) continue;
    const routeParams: Record<string, string> = { ...params };
    let match = true;
    for (let i = 0; i < routeSegs.length; i++) {
      if (routeSegs[i].startsWith(':')) routeParams[routeSegs[i].slice(1)] = segments[i];
      else if (routeSegs[i] !== segments[i]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    // Handlers receive query + path params merged with the request body,
    // so both `POST /checkins { memberId }` and `GET /members?search=x` work.
    return handler({ ...routeParams, ...(body ?? {}) }, ctx, body);
  }
  throw new ApiError(404, `No route for ${method} ${path}`);
}

export { currentStreak as computeStreak };

// Re-export a few helpers for owner screens
export function listRiskLevels(): RiskLevel[] {
  return ['ACTIVE', 'WATCH', 'AT_RISK', 'CRITICAL'];
}
