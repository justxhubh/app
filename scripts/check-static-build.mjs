// Smoke-check a static export of the app (e.g. the cPanel web build).
// Usage: node scripts/check-static-build.mjs <url>
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:8090/';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    errors.push(`[${m.type()}] ${m.text()}`);
  }
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const body = await page.evaluate(() => document.body.innerText);
const ok = body.includes('Login') || body.includes('Sign in') || body.includes('OTP') || body.includes('Enter your phone');
console.log('--- body preview ---');
console.log(body.slice(0, 400));
console.log('--- result ---');
console.log(ok ? '✅ Login screen rendered' : '❌ Login screen NOT detected');
console.log(errors.length === 0 ? '✅ No console errors/warnings' : `❌ ${errors.length} console issue(s):\n` + errors.join('\n'));
await browser.close();
process.exit(ok && errors.length === 0 ? 0 : 1);
