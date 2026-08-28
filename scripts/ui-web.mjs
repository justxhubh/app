// Headless-Chrome UI smoke test for the Expo web build.
// Walks the owner + member flows, asserts key screen text, captures console
// errors and screenshots. Run with: node scripts/ui-web.mjs

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const SHOTS = '/tmp/gym_ui';
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const warnings = [];

function log(msg) {
  console.log(`[ui] ${msg}`);
}

// Wait until body text contains `needle`.
async function text(page, needle, timeoutMs = 120_000) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout: timeoutMs },
    needle,
  );
}

// Wait until body text matches a regex (e.g. /\d+ days inactive|Never checked in/).
async function textRe(page, re, timeoutMs = 60_000) {
  await page.waitForFunction(
    ({ src, flags }) => {
      const r = new RegExp(src, flags);
      return document.body && r.test(document.body.innerText);
    },
    { timeout: timeoutMs },
    { src: re.source, flags: re.flags },
  );
}

async function clickFirstMatchingText(page, needle) {
  const ok = await page.evaluate((n) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(n)) {
        node.parentElement?.click();
        return true;
      }
    }
    return false;
  }, needle);
  if (!ok) throw new Error(`No element with text: ${needle}`);
}

// Demo login: tap the role button, enter the demo OTP (1234), verify.
async function demoLogin(page, demoLabel) {
  await clickFirstMatchingText(page, demoLabel);
  await text(page, 'Enter OTP');
  await page.waitForSelector('input[placeholder="4-digit OTP"]', { timeout: 30_000 });
  await page.click('input[placeholder="4-digit OTP"]');
  await page.keyboard.type('1234');
  await clickFirstMatchingText(page, 'Verify & Continue');
}

// Click the element whose trimmed text equals `needle` exactly (good for tab labels).
async function clickExactText(page, needle) {
  const ok = await page.evaluate((n) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === n) {
        node.parentElement?.click();
        return true;
      }
    }
    return false;
  }, needle);
  if (!ok) throw new Error(`No exact text: ${needle}`);
}

async function assertText(page, needle, label) {
  const found = await page.evaluate((n) => document.body.innerText.includes(n), needle);
  if (found) log(`  ✓ ${label}`);
  else {
    log(`  ✗ ${label} — missing text: ${needle}`);
    errors.push(`missing text: ${needle} (${label})`);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  log(`  📸 ${name}.png`);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=420,900'],
  defaultViewport: { width: 420, height: 900, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
page.on('console', (m) => {
  const type = m.type();
  const t = m.text();
  if (type === 'error') errors.push(`console.error: ${t}`);
  else if (type === 'warning') warnings.push(`console.warn: ${t}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));

try {
  log(`Opening ${BASE}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // ---------- Login screen ----------
  log('Login screen');
  await text(page, 'Iron Forge Fitness');
  await assertText(page, 'Login as Owner', 'login renders');
  await assertText(page, 'Send OTP', 'send-otp button renders');
  await shot(page, '01-login');

  // ---------- Owner: dashboard ----------
  log('Owner login + dashboard');
  await demoLogin(page, 'Login as Owner (Raj)');
  await text(page, 'Revenue At Risk');
  await assertText(page, 'Revenue At Risk', 'revenue-at-risk card');
  await assertText(page, 'Active Members', 'active members KPI');
  await assertText(page, 'At Risk', 'at-risk KPI');
  await assertText(page, 'Upcoming renewals', 'upcoming renewals section');
  await assertText(page, 'Revenue opportunities', 'opportunities section');
  await shot(page, '02-owner-dashboard');

  // ---------- At-risk list ----------
  log('At-risk list');
  await clickFirstMatchingText(page, 'View Members');
  await text(page, 'At-Risk Members');
  await assertText(page, 'Revenue at risk', 'at-risk summary');
  await textRe(page, /\d+ days inactive|Never checked in/);
  await assertText(page, 'days inactive', 'member risk cards');
  await shot(page, '03-at-risk');

  // Reload restores the session and lands back on the dashboard
  // (the mock DB resets per page load, which is fine here).
  log('Back to dashboard via reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await text(page, 'Revenue At Risk');

  // ---------- Members + profile ----------
  log('Members list');
  await clickExactText(page, 'Members');
  await page.waitForSelector('input[placeholder="Search name, phone or ID"]', { timeout: 30_000 });
  await textRe(page, /Last check-in|days inactive|Never checked in/);
  await assertText(page, 'Sort by', 'members sort toolbar');
  await clickFirstMatchingText(page, 'days inactive');
  await text(page, 'Member Profile');
  await text(page, 'Information'); // profile data has loaded
  await assertText(page, 'Timeline', 'profile timeline');
  await assertText(page, 'Revenue opportunities', 'profile opportunities');
  await shot(page, '04-member-profile');

  log('Back to dashboard via reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await text(page, 'Revenue At Risk');

  // ---------- Renewals ----------
  log('Renewals');
  await clickExactText(page, 'Renewals');
  await text(page, 'expected in next 30 days');
  await assertText(page, 'Due Today', 'renewals due today');
  await assertText(page, 'Overdue', 'renewals overdue');
  await shot(page, '05-renewals');

  // ---------- Revenue ----------
  log('Revenue');
  await clickExactText(page, 'Revenue');
  await text(page, 'All-time revenue');
  await assertText(page, 'Recent sales', 'recent sales');
  await shot(page, '06-revenue');

  // ---------- Settings: configurable risk thresholds ----------
  log('Settings — risk thresholds');
  await clickExactText(page, 'Dashboard');
  await text(page, 'Revenue At Risk');
  await page.waitForSelector('[data-testid="settings-gear"]', { timeout: 20_000 });
  await page.click('[data-testid="settings-gear"]');
  await text(page, 'Risk detection');
  await page.waitForSelector('input', { timeout: 20_000 });
  const readInputs = () => page.$$eval('input', (els) => els.map((e) => e.value));
  let settingsVals = await readInputs();
  if (settingsVals.includes('4') && settingsVals.includes('9') && settingsVals.includes('14')) {
    log('  ✓ settings load current thresholds (4/9/14)');
  } else {
    log(`  ✗ settings thresholds: ${JSON.stringify(settingsVals)}`);
    errors.push(`settings thresholds: ${JSON.stringify(settingsVals)}`);
  }
  // Edit the Watch threshold (second input): 9 -> 7, save, verify it persists.
  const setInput = async (idx, value) => {
    const inputs = await page.$$('input');
    await inputs[idx].click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(value);
  };
  await setInput(1, '7');
  await clickFirstMatchingText(page, 'Save thresholds');
  await new Promise((r) => setTimeout(r, 1500)); // mock + refetch latency
  settingsVals = await readInputs();
  if (settingsVals.includes('7') && !settingsVals.includes('9')) {
    log('  ✓ watch threshold saved and persisted (7)');
  } else {
    log(`  ✗ watch threshold not persisted: ${JSON.stringify(settingsVals)}`);
    errors.push(`watch threshold not persisted: ${JSON.stringify(settingsVals)}`);
  }
  await shot(page, '06b-settings');
  // Revert to the default so later phases are unaffected.
  await setInput(1, '9');
  await clickFirstMatchingText(page, 'Save thresholds');
  await new Promise((r) => setTimeout(r, 1200));

  // ---------- Notifications (owner) ----------
  log('Notifications — send reminder then open bell');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await text(page, 'Iron Forge Fitness');
  await demoLogin(page, 'Login as Owner (Raj)');
  await text(page, 'Revenue At Risk');
  await clickFirstMatchingText(page, 'Remind');
  await new Promise((r) => setTimeout(r, 1500)); // let the mock push the notification
  await page.waitForSelector('[data-testid="notifications-bell"]', { timeout: 20_000 });
  await page.click('[data-testid="notifications-bell"]');
  await text(page, 'Notifications');
  // Wait for the list (or its empty/error state) rather than the static header.
  await textRe(page, /Reminder sent|No notifications yet|Couldn't load notifications/);
  const hasNotif = await page.evaluate(() => document.body.innerText.includes('Reminder sent'));
  if (!hasNotif) {
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 500));
    log(`  notifications screen text: ${JSON.stringify(dump)}`);
  }
  await assertText(page, 'Reminder sent', 'in-app notification from remind');
  await shot(page, '07-notifications');

  // ---------- Member flow ----------
  log('Member flow — clearing session and logging in as Priya');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await text(page, 'Iron Forge Fitness', 30_000);
      break;
    } catch {
      if (attempt === 3) throw new Error('login screen did not appear after clear+reload');
      log(`  login screen not ready, reloading (attempt ${attempt + 1})`);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
  try {
    await demoLogin(page, 'Login as Member (Priya)');
  } catch (e) {
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 600));
    log(`  member-login screen text: ${JSON.stringify(dump)}`);
    throw e;
  }
  try {
    await text(page, 'Day Streak', 45_000);
  } catch (e) {
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 600));
    log(`  member home text: ${JSON.stringify(dump)}`);
    throw e;
  }
  await assertText(page, 'Iron Forge Fitness', 'member home membership card');
  await assertText(page, 'Check in now', 'member home check-in CTA');
  await shot(page, '08-member-home');

  log('Check-in (demo scan)');
  await clickExactText(page, 'Check-in');
  await text(page, 'Scan your gym');
  await clickFirstMatchingText(page, 'Simulate scanning gym QR');
  await text(page, 'Check-in successful');
  await assertText(page, 'Day Streak', 'streak after check-in');
  await shot(page, '09-checkin-success');

  log('Progress');
  await clickExactText(page, 'Progress');
  await text(page, 'Your Attendance');
  await assertText(page, 'Milestones', 'milestones section');
  await assertText(page, 'This week', 'weekly strip');
  await shot(page, '10-progress');

  log('Member profile tab');
  await clickExactText(page, 'Profile');
  await text(page, 'Push notifications');
  await assertText(page, 'Log out', 'logout button');
  await shot(page, '11-member-profile');
} catch (e) {
  errors.push(`flow error: ${e.message}`);
  await shot(page, '99-error').catch(() => {});
} finally {
  await browser.close();
}

console.log('\n===== CONSOLE WARNINGS =====');
for (const w of [...new Set(warnings)].slice(0, 30)) console.log(' -', w);
console.log('\n===== ERRORS =====');
for (const e of [...new Set(errors)].slice(0, 40)) console.log(' -', e);
console.log(`\n${errors.length === 0 ? '✅ No errors' : `❌ ${errors.length} error(s) — see above`}`);
process.exit(errors.length === 0 ? 0 : 1);
