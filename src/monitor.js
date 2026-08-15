// Orchestrator single-shot: login → scrape /my/ + calendar upcoming → normalize → diff → notify → save state.
import { chromium } from 'playwright';
import { getConfig } from './config.js';
import { logger, redact } from './redact.js';
import { extractTimeline, extractCalendar, mergeSources } from './parser.js';
import { normalizeTitle, parseMoodleDate, typeFromUrl, fingerprint, metadataHash, normalizeItem } from './normalize.js';
import { applyChanges } from './changes.js';
import { notifyEvent, notifyAlert } from './telegram.js';
import { loadState, saveState } from './state.js';

async function withinWindow(cfg) {
  if (process.env.FORCE_RUN === '1') return true;
  const jakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const day = jakarta.getDay(); // 0=Sun
  const hour = jakarta.getHours();
  if (day === 0) return false;
  const w = cfg.window;
  if (w.overrides) {
    for (const ov of w.overrides) {
      if (ov.days.includes(day)) return hour >= parseInt(ov.start) && hour < parseInt(ov.end);
    }
  }
  return hour >= parseInt(w.default.start) && hour < parseInt(w.default.end);
}

async function checkAccount(browser, account, globalState, cfg) {
  const nowIso = new Date().toISOString();
  const prevItems = globalState.items?.filter((i) => i.accountId === account.id) ?? [];
  const failStreak = globalState.accounts?.[account.id]?.meta?.failStreak ?? 0;

  const context = await browser.newContext({ userAgent: cfg.userAgent });
  const page = await context.newPage();

  try {
    // ── Login ──
    await page.goto(`${cfg.baseUrl}/login/index.php`, { waitUntil: 'domcontentloaded', timeout: cfg.net.navTimeoutMs });
    await page.fill('input#username', account.username);
    await page.fill('input#password', account.password);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('button#loginbtn, input#loginbtn'),
    ]);
    await page.waitForTimeout(2500);

    // Deteksi login gagal
    if (page.url().includes('/login/') || await page.$('.errorbox, .loginerrors, [role="alert"]')) {
      throw Object.assign(new Error('LOGIN_FAILED'), { code: 'LOGIN_FAILED' });
    }

    // ── Scrape /my/ ──
    await page.goto(`${cfg.baseUrl}/my/`, { waitUntil: 'domcontentloaded', timeout: cfg.net.navTimeoutMs });
    await page.waitForTimeout(3500);
    const dashRaw = await extractTimeline(page);

    // ── Scrape /calendar/view.php?view=upcoming ──
    await page.goto(`${cfg.baseUrl}/calendar/view.php?view=upcoming`, { waitUntil: 'domcontentloaded', timeout: cfg.net.navTimeoutMs });
    await page.waitForTimeout(2000);
    const calRaw = await extractCalendar(page);

    // ── Merge + Normalize ──
    const merged = mergeSources(dashRaw, calRaw);
    const normalized = merged.map((raw) => {
      const item = normalizeItem(account.id, account.label, raw);
      item.fingerprint = fingerprint(item);
      item.metadataHash = metadataHash(item);
      item.dueAt = parseMoodleDate(raw.dateText);
      return item;
    });

    logger.info(`[${account.id}] scraped: ${dashRaw.length} dashboard + ${calRaw.length} calendar → ${normalized.length} normalized`);

    // ── Diff + sanity ──
    const { events, newAccountState, guardBlocked } = applyChanges(
      { items: prevItems, accounts: globalState.accounts },
      account.id,
      normalized,
      cfg.sanity,
    );

    if (guardBlocked) {
      logger.warn(`[${account.id}] guard blocked — ${events[0]?.reason}`);
    }

    // ── Notify ──
    if (!guardBlocked && cfg.telegram.token && cfg.telegram.chatId) {
      for (const ev of events) {
        const sent = await notifyEvent(ev, account.label, false);
        if (!sent) logger.warn(`[${account.id}] telegram failed for ${ev.fingerprint}`);
      }
    }

    return {
      ok: true,
      events,
      newItems: normalized,
      newAccountState: { ...newAccountState, meta: { failStreak: 0, lastSuccessAt: nowIso } },
    };
  } catch (err) {
    const code = err.code ?? 'UNKNOWN';
    logger.error(`[${account.id}] error: ${code} — ${err.message}`);
    const newFailStreak = failStreak + 1;
    if (newFailStreak >= cfg.health.failThreshold && cfg.telegram.token && cfg.telegram.chatId) {
      await notifyAlert(`Monitor gagal ${newFailStreak}x beruntun (${account.label}): ${code}`);
    }
    return {
      ok: false,
      events: [],
      newItems: prevItems, // keep old items on error so state doesn't go empty
      newAccountState: { meta: { failStreak: newFailStreak, lastError: code } },
      error: code,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const cfg = getConfig();

  if (!cfg.accounts.length) {
    logger.error('ELEARNING_ACCOUNTS kosong — tidak ada akun dikonfigurasi.');
    process.exit(1);
  }

  if (!(await withinWindow(cfg))) {
    logger.info('Di luar jadwal sekolah (Sen-Sab 06–18 WIB). Skip. FORCE_RUN=1 untuk paksa.');
    process.exit(0);
  }

  const globalState = await loadState();
  globalState.items = globalState.items ?? [];
  globalState.accounts = globalState.accounts ?? {};

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.USE_SYSTEM_CHROME === '1' ? { channel: 'chrome' } : {}),
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  let anyOk = false;
  for (const account of cfg.accounts) {
    const res = await checkAccount(browser, account, globalState, cfg);
    // Update global state
    globalState.accounts[account.id] = res.newAccountState;
    // Rebuild global items list from all accounts
    globalState.items = Object.values(globalState.accounts).flatMap((a) => a.items ?? []);
    if (res.ok) anyOk = true;
    // Jeda antar akun: 3–5 detik
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
  }

  await browser.close();
  await saveState(globalState);
  logger.info(`selesai. anyOk=${anyOk}`);
  process.exit(anyOk ? 0 : 1);
}

main().catch((e) => {
  logger.error(`FATAL: ${redact(e.stack ?? String(e.message))}`);
  process.exit(2);
});