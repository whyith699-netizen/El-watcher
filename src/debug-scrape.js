// Debug tool: scrape sekali & dump hasil stdout + file; kirim screenshot ke Telegram.
// Pakai: node src/debug-scrape.js
import 'dotenv/config';
import { chromium } from 'playwright';
import { extractTimeline, extractCalendar } from './parser.js';
import { normalizeItem, fingerprint, metadataHash, parseMoodleDate } from './normalize.js';
import { sendPhoto } from './telegram.js';
import { redact, logger } from './redact.js';
import fs from 'node:fs';

// Ambil kredensial dari .env (FORCE_RUN agar tidak di-skip window check)
const base = process.env.ELEARNING_BASE_URL ?? 'https://elearning.sma1klaten.sch.id';
const accountsRaw = process.env.ELEARNING_ACCOUNTS ?? '';
const firstAccount = accountsRaw.split(',').map(s => s.trim()).filter(Boolean)[0];
const [user, label, pass] = firstAccount ? firstAccount.split(':') : [];
if (!user || !pass) {
  console.error('ELEARNING_ACCOUNTS kosong atau format salah. Harus: user:label:pass');
  process.exit(1);
}

const ts = Date.now();
const tmpDir = `/tmp/elwatch-debug-${ts}`;
fs.mkdirSync(tmpDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// ── Login ──
await page.goto(`${base}/login/index.php`, { waitUntil: 'domcontentloaded' });
await page.fill('input#login-username, input#menu-login-username', user);
await page.fill('input#login-password, input#menu-login-password', pass);
await page.click('button[type="submit"], input[type="submit"]', { force: true });
await page.waitForTimeout(3000);
console.log('URL setelah login:', page.url());

if (page.url().includes('/login/')) {
  const shot = `${tmpDir}/login-fail.png`;
  await page.screenshot({ path: shot, fullPage: false });
  await sendPhoto(shot, `❌ Login gagal — URL masih ${page.url()}`);
  console.error('Login gagal, screenshot terkirim.');
  process.exit(1);
}

// ── Screenshot dashboard ──
await page.goto(`${base}/my/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const dashShot = `${tmpDir}/dashboard.png`;
await page.screenshot({ path: dashShot, fullPage: true });
const dashItems = await extractTimeline(page);
console.log(`\n=== DASHBOARD /my/: ${dashItems.length} items ===`);
console.log(JSON.stringify(dashItems, null, 2));

// ── Screenshot calendar ──
await page.goto(`${base}/calendar/view.php?view=upcoming`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const calShot = `${tmpDir}/calendar.png`;
await page.screenshot({ path: calShot, fullPage: true });
const calItems = await extractCalendar(page);
console.log(`\n=== CALENDAR upcoming: ${calItems.length} items ===`);
console.log(JSON.stringify(calItems, null, 2));

// ── Normalisasi ──
const normalized = [...dashItems, ...calItems].map((raw) => {
  const item = normalizeItem('debug', label || 'DEBUG', raw);
  item.fingerprint = fingerprint(item);
  item.metadataHash = metadataHash(item);
  item.dueAt = parseMoodleDate(raw.dateText);
  return item;
});
console.log(`\n=== NORMALIZED: ${normalized.length} ===`);
console.log(redact(JSON.stringify(normalized, null, 2)));

// ── Kirim screenshot ke Telegram ──
const caption = `📸 <b>EL-Watcher Debug</b>\nUser: ${user}\nDashboard: ${dashItems.length} items\nCalendar: ${calItems.length} items\nNormalized: ${normalized.length} items`;
await sendPhoto(dashShot, caption, { parse_mode: 'HTML' });
if (fs.existsSync(calShot)) await sendPhoto(calShot, '📅 Calendar upcoming', { parse_mode: 'HTML' });
console.log('\nScreenshot terkirim ke Telegram ✅');

// Simpan HTML fixture tersensor buat test
const html = await page.content();
fs.writeFileSync(`${tmpDir}/fixture-calendar.html`, html);
console.log(`Fixture HTML tersimpan: ${tmpDir}/fixture-calendar.html`);

await browser.close();
