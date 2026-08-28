/* Smoke test for the mock backend logic (runs with `npx tsx scripts/smoke.ts`). */
import { handleRequest, ApiError } from '../src/services/api/mock/server';
import { db } from '../src/services/api/mock/db';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, path: string, body?: Record<string, unknown>, token?: string): Promise<any> {
  return handleRequest(method, path, body, { token });
}

async function expectError(name: string, fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    failures++;
    console.error(`  ✗ ${name} — expected error ${status}, none thrown`);
  } catch (e) {
    if (e instanceof ApiError && e.status === status) console.log(`  ✓ ${name}`);
    else {
      failures++;
      console.error(`  ✗ ${name} — wrong error`, e);
    }
  }
}

async function main() {
  const owner = 'mock-token-owner';
  const memberToken = 'mock-token-member-m-2';

  console.log('\nAuth');
  check('send-otp returns demo OTP', (await call('POST', '/auth/send-otp', { phone: '9822000000' })).otp === '1234');
  const session = await call('POST', '/auth/verify-otp', { phone: '9822000000', otp: '1234' });
  check('verify-otp returns owner session', session.user.role === 'OWNER');
  await expectError('verify-otp with wrong OTP', () => call('POST', '/auth/verify-otp', { phone: '9822000000', otp: '9999' }), 400);
  await expectError('protected route without token', () => call('GET', '/dashboard/summary'), 401);
  await expectError('member blocked from owner dashboard', () => call('GET', '/dashboard/summary', undefined, memberToken), 403);

  // Tokens straight from the real login flow must work (regression guard for
  // the member-token format: `mock-token-member-<memberId>`, not `u-<memberId>`).
  const memberSession = await call('POST', '/auth/verify-otp', { phone: '9876543210', otp: '1234' });
  const realMemberToken = memberSession.accessToken as string;
  check('member token encodes raw member id', realMemberToken === 'mock-token-member-m-2', realMemberToken);
  const own = await call('GET', '/members/m-2', undefined, realMemberToken);
  check('token from login flow authorizes member', own.member.id === 'm-2');

  console.log('\nDashboard');
  const dash = await call('GET', '/dashboard/summary', undefined, owner);
  check('active members > 0', dash.activeMembers > 0, dash.activeMembers);
  check('at-risk count reported', typeof dash.atRiskCount === 'number');
  check('revenue at risk is a number', typeof dash.revenueAtRisk === 'number');
  check('weekly trend has 7 entries', dash.weeklyTrend.length === 7);
  check('upcoming renewals sorted by expiry', dash.upcomingRenewals.every((r: { daysUntilExpiry: number }, i: number, a: { daysUntilExpiry: number }[]) => i === 0 || a[i - 1].daysUntilExpiry <= r.daysUntilExpiry));

  console.log('\nMembers & risk');
  const members = (await call('GET', '/members', undefined, owner)).members;
  const critical = members.filter((m: { risk: { level: string } }) => m.risk.level === 'CRITICAL');
  const atRisk = members.filter((m: { risk: { level: string } }) => m.risk.level === 'AT_RISK');
  const watch = members.filter((m: { risk: { level: string } }) => m.risk.level === 'WATCH');
  const active = members.filter((m: { risk: { level: string } }) => m.risk.level === 'ACTIVE');
  check('all four risk buckets present', critical.length > 0 && atRisk.length > 0 && watch.length > 0 && active.length > 0, { critical: critical.length, atRisk: atRisk.length, watch: watch.length, active: active.length });
  const search = (await call('GET', '/members?search=rahul', undefined, owner)).members;
  check('search works', search.every((m: { name: string }) => m.name.toLowerCase().includes('rahul')));

  console.log('\nCheck-in flow');
  // m-3 has no check-in within the last ~5 days, so the duplicate window is clear.
  const member3Token = 'mock-token-member-m-3';
  const member = db.members.find((m) => m.id === 'm-3')!;
  const before = member.lastCheckInAt;
  const res = await call('POST', '/checkins', { memberId: 'm-3', source: 'QR', qrPayload: `IFG|gym:${db.gym.id}|ts:${Date.now()}` }, member3Token);
  check('check-in recorded', res.checkIn.memberId === 'm-3');
  check('lastCheckInAt updated', member.lastCheckInAt !== before);
  await expectError('duplicate check-in within 30min rejected', () => call('POST', '/checkins', { memberId: 'm-3', source: 'QR', qrPayload: `IFG|gym:${db.gym.id}|ts:${Date.now()}` }, member3Token), 409);
  await expectError('invalid QR rejected', () => call('POST', '/checkins', { memberId: 'm-3', source: 'QR', qrPayload: 'BAD-PAYLOAD' }, member3Token), 400);
  check('streak recomputed after check-in', typeof res.streak === 'number');

  console.log('\nRenewals');
  const renewals = (await call('GET', '/renewals', undefined, owner)).renewals;
  const upcoming = renewals.filter((r: { daysUntilExpiry: number }) => r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30);
  const overdue = renewals.filter((r: { daysUntilExpiry: number }) => r.daysUntilExpiry < 0);
  check('renewals list has upcoming + overdue', upcoming.length > 0 && overdue.length > 0, { upcoming: upcoming.length, overdue: overdue.length });
  const remind = await call('POST', `/renewals/${renewals[0].id}/remind`, undefined, owner);
  check('reminder sent', remind.ok === true);
  const renewed = await call('POST', `/renewals/${renewals[0].id}/renew`, undefined, owner);
  check('renewal extends membership', new Date(renewed.membership.endDate) > new Date(renewals[0].endDate));

  console.log('\nRevenue');
  const revenue = await call('GET', '/revenue/summary', undefined, owner);
  check('revenue summary totals', revenue.totalRevenue >= revenue.pt + revenue.diet + revenue.supplement);
  const opps = (await call('GET', '/revenue/opportunities', undefined, owner)).opportunities;
  check('opportunities have PT/DIET/SUPPLEMENT', ['PT', 'DIET', 'SUPPLEMENT'].every((c) => opps.some((o: { category: string }) => o.category === c)));
  const ptOnly = (await call('GET', '/revenue/opportunities?category=PT', undefined, owner)).opportunities;
  check('category filter works', ptOnly.every((o: { category: string }) => o.category === 'PT'));
  const sale = await call('POST', '/sales', { memberId: 'm-3', serviceId: 'svc-diet' }, owner);
  check('sale recorded', sale.sale.amount > 0);

  console.log('\nMember attendance');
  const att = await call('GET', '/members/m-2/attendance', undefined, memberToken);
  check('attendance summary returned', typeof att.thisMonth === 'number' && typeof att.attendanceRate === 'number' && Object.keys(att.last30Days).length === 30);
  await expectError('member cannot read other member attendance', () => call('GET', '/members/m-5/attendance', undefined, memberToken), 403);

  console.log('\nMember profile access');
  const ownProfile = await call('GET', '/members/m-2', undefined, memberToken);
  check('member can read own profile', ownProfile.member.id === 'm-2' && Array.isArray(ownProfile.timeline));
  await expectError('member cannot read another member profile', () => call('GET', '/members/m-5', undefined, memberToken), 403);

  console.log('\nSettings (configurable risk thresholds)');
  const settings = await call('GET', '/settings', undefined, owner);
  check('default thresholds returned', settings.riskThresholds.activeMax === 4 && settings.riskThresholds.watchMax === 9 && settings.riskThresholds.atRiskMax === 14, JSON.stringify(settings.riskThresholds));
  await expectError('member cannot read settings', () => call('GET', '/settings', undefined, memberToken), 403);
  await expectError('non-increasing thresholds rejected', () => call('PATCH', '/settings', { riskThresholds: { activeMax: 5, watchMax: 4, atRiskMax: 14 } }, owner), 400);
  const beforeSummary = await call('GET', '/dashboard/risk-summary', undefined, owner);
  const patched = await call('PATCH', '/settings', { riskThresholds: { activeMax: 3, watchMax: 7, atRiskMax: 12 } }, owner);
  check('thresholds updated', patched.riskThresholds.atRiskMax === 12);
  const after = await call('GET', '/dashboard/risk-summary', undefined, owner);
  check('tighter thresholds move members to critical', after.critical > beforeSummary.critical && after.active < beforeSummary.active, { beforeSummary, after });
  await call('PATCH', '/settings', { riskThresholds: { activeMax: 4, watchMax: 9, atRiskMax: 14 } }, owner);
  const reset = await call('GET', '/settings', undefined, owner);
  check('thresholds reset to defaults', reset.riskThresholds.watchMax === 9);

  console.log(`\n${failures === 0 ? '✅ All checks passed' : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
