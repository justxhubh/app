// In-memory mock database with deterministic seed data.
// Simulates the backend described in PRD §17–§19 so the frontend
// can be built and demoed without a server.

import type {
  CheckIn,
  Gym,
  Member,
  Membership,
  MembershipPlan,
  RiskThresholds,
  Sale,
  Service,
  User,
} from '../../../types';
import { DEFAULT_RISK_THRESHOLDS } from '../../../utils/risk';
import { addDays } from '../../../utils/format';

// Deterministic PRNG so demo data is stable across reloads
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260814);

const FIRST = [
  'Rahul', 'Priya', 'Amit', 'Neha', 'Vikram', 'Sneha', 'Rohan', 'Ananya', 'Karan', 'Pooja',
  'Arjun', 'Divya', 'Siddharth', 'Meera', 'Aditya', 'Riya', 'Nikhil', 'Kavya', 'Sanjay', 'Ishita',
  'Manish', 'Tanvi', 'Gaurav', 'Shreya', 'Deepak', 'Aarti', 'Suresh', 'Nandini', 'Rakesh', 'Swati',
  'Harish', 'Pallavi', 'Vinod', 'Kiran', 'Ashish', 'Lakshmi', 'Mohan', 'Ritu', 'Prakash', 'Anjali',
  'Naveen', 'Simran', 'Rajesh', 'Komal', 'Sachin', 'Madhavi', 'Yash', 'Bhavna', 'Imran', 'Farah',
  'Ravi', 'Gita', 'Omkar', 'Sonal', 'Dinesh', 'Pratibha', 'Akhil', 'Rashmi', 'Vivek', 'Shweta',
];

const LAST = [
  'Sharma', 'Mehta', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Joshi',
  'Chopra', 'Malhotra', 'Verma', 'Saxena', 'Desai', 'Kulkarni', 'Pillai', 'Mishra', 'Bhatt', 'Agarwal',
  'Rao', 'Das', 'Banerjee', 'Kapoor', 'Kohli', 'Sethi', 'Menon', 'Shah', 'Chauhan', 'Yadav',
  'Tiwari', 'Ghosh', 'Bose', 'Dutta', 'Nayak', 'Shetty', 'Kaur', 'Arora', 'Bajaj', 'Khanna',
];

export const GYM: Gym = {
  id: 'gym-1',
  name: 'Iron Forge Fitness',
  address: 'MG Road, Pune',
  ownerId: 'u-owner',
  timezone: 'Asia/Kolkata',
  createdAt: '2024-01-10T09:00:00.000Z',
};

export const OWNER: User = {
  id: 'u-owner',
  name: 'Raj',
  phone: '9822000000',
  email: 'raj@ironforge.in',
  role: 'OWNER',
  gymId: GYM.id,
  createdAt: '2024-01-10T09:00:00.000Z',
};

export const PLANS: MembershipPlan[] = [
  { id: 'plan-basic', name: 'Basic Monthly', type: 'MONTHLY', price: 1499, durationDays: 30 },
  { id: 'plan-gold', name: 'Gold Monthly', type: 'MONTHLY', price: 2499, durationDays: 30 },
  { id: 'plan-premium', name: 'Premium Monthly', type: 'MONTHLY', price: 3999, durationDays: 30 },
  { id: 'plan-gold-yearly', name: 'Gold Yearly', type: 'YEARLY', price: 24990, durationDays: 365 },
];

export const SERVICES: Service[] = [
  { id: 'svc-pt', gymId: GYM.id, name: '8 PT Sessions', category: 'PT', price: 4000, active: true },
  { id: 'svc-pt-12', gymId: GYM.id, name: '12 PT Sessions', category: 'PT', price: 5500, active: true },
  { id: 'svc-diet', gymId: GYM.id, name: 'Monthly Diet Plan', category: 'DIET', price: 999, active: true },
  { id: 'svc-diet-premium', gymId: GYM.id, name: 'Premium Diet Plan', category: 'DIET', price: 1999, active: true },
  { id: 'svc-whey', gymId: GYM.id, name: 'Whey Protein 1kg', category: 'SUPPLEMENT', price: 2499, active: true },
  { id: 'svc-creatine', gymId: GYM.id, name: 'Creatine 250g', category: 'SUPPLEMENT', price: 899, active: true },
];

interface MemberSeed {
  id: string;
  name: string;
  phone: string;
  daysInactive: number; // days since last check-in; -1 = never checked in
  daysToExpiry: number; // membership expiry relative to today; negative = overdue
  planIndex: number;
  attendanceRate: number; // 0-1 rate of days attended while "active"
  autoRenew: boolean;
  sales: { serviceId: string }[];
  status?: Member['status'];
}

function genSeeds(): MemberSeed[] {
  const seeds: MemberSeed[] = [];
  const total = 46;
  for (let i = 0; i < total; i++) {
    const name = `${FIRST[(i * 7 + 3) % FIRST.length]} ${LAST[(i * 11 + 5) % LAST.length]}`;
    const role = i % 7; // spread across risk buckets
    let daysInactive: number;
    if (role === 0) daysInactive = rng() < 0.5 ? 15 + Math.floor(rng() * 14) : -1; // critical / never
    else if (role === 1) daysInactive = 10 + Math.floor(rng() * 5); // at risk
    else if (role === 2) daysInactive = 5 + Math.floor(rng() * 5); // watch
    else daysInactive = Math.floor(rng() * 5); // active

    let daysToExpiry: number;
    const expiryRoll = rng();
    if (expiryRoll < 0.12) daysToExpiry = -(1 + Math.floor(rng() * 10)); // overdue
    else if (expiryRoll < 0.35) daysToExpiry = Math.floor(rng() * 8); // due in next week
    else if (expiryRoll < 0.6) daysToExpiry = 8 + Math.floor(rng() * 23); // next 30 days
    else daysToExpiry = 31 + Math.floor(rng() * 200); // later

    const planIndex = rng() < 0.15 ? 0 : rng() < 0.55 ? 1 : rng() < 0.85 ? 2 : 3;

    seeds.push({
      id: `m-${i + 1}`,
      name,
      phone: `98${String(70000000 + i * 12345).slice(0, 8)}`,
      daysInactive,
      daysToExpiry,
      planIndex,
      attendanceRate: 0.35 + rng() * 0.5,
      autoRenew: rng() < 0.3,
      sales: [],
    });
  }
  // Demo member account used by the member app flow (phone 9876543210).
  // Checked in today with a healthy 7-day streak.
  seeds[1] = {
    ...seeds[1],
    name: 'Priya Mehta',
    phone: '9876543210',
    daysInactive: 1, // last check-in yesterday — scanning today completes a 7-day streak
    daysToExpiry: 6,
    planIndex: 1,
    attendanceRate: 0.75,
  };
  return seeds;
}

export interface Db {
  gym: Gym;
  owner: User;
  plans: MembershipPlan[];
  services: Service[];
  members: Member[];
  memberships: Membership[];
  checkIns: CheckIn[];
  sales: Sale[];
  otps: Record<string, string>;
  riskThresholds: RiskThresholds;
}

const NOW = new Date();

function buildMembers(seeds: MemberSeed[]): Member[] {
  return seeds.map((s) => ({
    id: s.id,
    gymId: GYM.id,
    userId: undefined,
    name: s.name,
    phone: s.phone,
    email: `${s.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    status: s.status ?? (s.daysToExpiry < 0 ? 'EXPIRED' : 'ACTIVE'),
    lastCheckInAt:
      s.daysInactive === -1 ? null : addDays(NOW.toISOString(), -s.daysInactive),
    createdAt: addDays(NOW.toISOString(), -60 - Math.floor(rng() * 400)),
  }));
}

function buildMemberships(seeds: MemberSeed[]): Membership[] {
  return seeds.map((s, i) => {
    const plan = PLANS[s.planIndex];
    const endDate = addDays(NOW.toISOString(), s.daysToExpiry);
    const startDate = addDays(endDate, -plan.durationDays);
    return {
      id: `mem-${i + 1}`,
      memberId: s.id,
      planId: plan.id,
      planName: plan.name,
      startDate,
      endDate,
      price: plan.price,
      status: s.daysToExpiry < 0 ? 'EXPIRED' : 'ACTIVE',
      autoRenew: s.autoRenew,
    };
  });
}

// Deterministic check-in history over the last 45 days per member.
// A member with `daysInactive` = N attended until N days ago and then stopped,
// so check-ins exist for days >= N. The demo member (index 1) gets a forced
// 7-day streak ending today.
function buildCheckIns(seeds: MemberSeed[]): CheckIn[] {
  const out: CheckIn[] = [];
  let id = 1;
  for (const s of seeds) {
    const stopDays = s.daysInactive === -1 ? 45 + Math.floor(rng() * 30) : s.daysInactive;
    for (let d = 0; d < 45; d++) {
      if (s.id === 'm-2') {
        // Priya: 6 consecutive days ending yesterday (streak 7 after today's scan),
        // then scattered history for a realistic month
        if (d === 0) continue;
        if (d > 6 && rng() > 0.55) continue;
      } else if (d < stopDays) {
        continue; // stopped attending after last check-in
      } else if (rng() >= s.attendanceRate) {
        continue;
      }
      // Random-ish time during gym hours
      const at = new Date(NOW.getTime() - d * 86400000);
      at.setHours(6 + Math.floor(rng() * 13), Math.floor(rng() * 60), 0, 0);
      out.push({
        id: `ci-${id++}`,
        memberId: s.id,
        gymId: GYM.id,
        checkedInAt: at.toISOString(),
        source: rng() < 0.9 ? 'QR' : 'MANUAL',
      });
    }
  }
  return out;
}

// Deterministic sales: ~18% of members own PT, ~14% diet, ~12% supplements
function buildSales(seeds: MemberSeed[]): Sale[] {
  const out: Sale[] = [];
  let id = 1;
  for (const s of seeds) {
    if (s.daysInactive >= 15) continue; // lost members don't buy
    const r = rng();
    const svc = r < 0.18 ? SERVICES[0] : r < 0.32 ? SERVICES[2] : r < 0.44 ? SERVICES[4] : null;
    if (!svc) continue;
    const at = new Date(NOW.getTime() - Math.floor(rng() * 40) * 86400000);
    out.push({
      id: `sale-${id++}`,
      memberId: s.id,
      serviceId: svc.id,
      amount: svc.price,
      status: 'COMPLETED',
      createdAt: at.toISOString(),
    });
  }
  return out;
}

function buildDb(): Db {
  const seeds = genSeeds();
  return {
    gym: GYM,
    owner: OWNER,
    plans: PLANS,
    services: SERVICES,
    members: buildMembers(seeds),
    memberships: buildMemberships(seeds),
    checkIns: buildCheckIns(seeds),
    sales: buildSales(seeds),
    otps: {},
    riskThresholds: { ...DEFAULT_RISK_THRESHOLDS },
  };
}

export const db: Db = buildDb();

// Demo member account — Priya Mehta with a healthy streak for the member flow.
export const DEMO_MEMBER_ID = 'm-2';

export function resetDb(): void {
  const fresh = buildDb();
  Object.assign(db, fresh);
}

export function getMember(id: string): Member | undefined {
  return db.members.find((m) => m.id === id);
}

export function getMembership(memberId: string): Membership | undefined {
  return db.memberships.find((m) => m.memberId === memberId);
}

export function getService(id: string): Service | undefined {
  return db.services.find((s) => s.id === id);
}

export function getSalesForMember(memberId: string): Sale[] {
  return db.sales.filter((s) => s.memberId === memberId);
}
