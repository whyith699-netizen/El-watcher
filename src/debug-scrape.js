import { chromium } from 'playwright';
import { parseDashboard, parseCalendar } from './parser.js';
import { normalizeItems } from './normalize.js';
import { redact } from './redact.js';
import fs from 'node:fs';

// Debug tool: scrape sekali & dump hasil ke stdout + file JSON (tersensor).
// Pakai: node src/debug-scrape.js <user> <pass>
const [user, pass] = process.argv.slice(2);
if (!user || !pass) {
  console.error('Pakai: node src/debug-scrape.js <user> <pass>');
  process.exit(1);
}

const base = process.env.ELEARNING_BASE_URL ?? 'https://elearning.sma1klaten.sch.id';
const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const page = await (await browser.newContext()).newPage();

await page.goto(`${base}/login/index.php`, { waitUntil: 'domcontentloaded' });
await page.fill('input#username', user);
await page.fill('input#password', pass);
await page.click('button#loginbtn, input#loginbtn');
await page.waitForTimeout(3000);
console.log('URL setelah login:', page.url());

await page.goto(`${base}/my/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const dashItems = await parseDashboard(page);
console.log(`\n=== DASHBOARD /my/: ${dashItems.length} items ===`);
console.log(JSON.stringify(dashItems, null, 2));

await page.goto(`${base}/calendar/view.php?view=upcoming`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const calItems = await parseCalendar(page);
console.log(`\n=== CALENDAR upcoming: ${calItems.length} items ===`);
console.log(JSON.stringify(calItems, null, 2));

// Simpan HTML fixture tersensor buat test
const html = await page.content();
fs.writeFileSync('/tmp/elwatch-fixture-calendar.html', html);
console.log('\nFixture HTML tersimpan: /tmp/elwatch-fixture-calendar.html (REVIEW & SENSOR sebelum commit!)');

const normalized = normalizeItems([...dashItems, ...calItems], { id: 'debug', classLabel: 'DEBUG' });
console.log(`\n=== NORMALIZED: ${normalized.length} ===`);
console.log(redact(JSON.stringify(normalized, null, 2)));

await browser.close();
