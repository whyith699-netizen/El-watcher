// Orchestrator single-shot: login → scrape → normalize → diff → notify → save state.
import 'dotenv/config';
import { chromium } from 'playwright';
import { DRY_RUN, getConfig } from './config.js';
import { logger, redact } from './redact.js';
import { extractTimeline, extractCalendar, mergeSources } from './parser.js';
import { parseMoodleDate, fingerprint, metadataHash, normalizeItem } from './normalize.js';
import { applyChanges } from './changes.js';
import { notifyEvent, notifyAlert } from './telegram.js';
import { loadState, saveState } from './state.js';

function timeToMinutes(value) {
  const [hours, minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
}

async function withinWindow(cfg) {
  if (process.env.FORCE_RUN === '1') return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: cfg.window.tz,
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[values.weekday];
  const current = Number(values.hour) * 60 + Number(values.minute);
  const override = cfg.window.overrides?.find((item) => item.days.includes(day));
  const activeWindow = override ?? (cfg.window.default.days.includes(day) ? cfg.window.default : null);
  if (!activeWindow) return false;
  return current >= timeToMinutes(activeWindow.start) && current < timeToMinutes(activeWindow.end);
}

async function checkAccount(browser, account, globalState, cfg) {
  const nowIso = new Date().toISOString();
  const prevItems = globalState.items?.filter((i) => i.accountId === account.id) ?? [];
  const failStreak = globalState.accounts?.[account.id]?.meta?.failStreak ?? 0;
  const context = await browser.newContext({ userAgent: cfg.userAgent });
  const page = await context.newPage();

  try {
    await page.goto(`${cfg.baseUrl}/login/index.php`, { waitUntil: 'domcontentloaded', timeout: cfg.net.navTimeoutMs });
    const formFound = await page.evaluate(([u, p]) => {
      const form = document.querySelector('form#login, form#menu-form-login');
      if (!form) return false;
      const uField = form.querySelector('input[name="username"]');
      const pField = form.querySelector('input[name="password"]');
      if (!uField || !pField) return false;
      uField.value = u;
      pField.value = p;
      form.submit();
      return true;
    }, [account.username, account.password]);
    if (!formFound) throw Object.assign(new Error('LOGIN_FORM_NOT_FOUND'), { code: 'LOGIN_FORM_NOT_FOUND' });
    await page.waitForTimeout(2500);

    if (page.url().includes('/login/') || await page.$('.errorbox, .loginerrors, [role="alert"]')) {
      throw Object.assign(new Error('LOGIN_FAILED'), { code: 'LOGIN_FAILED' });
    }

    await page.goto(`${cfg.baseUrl}/my/`, { waitUntil: 'domcontentloaded', timeout: cfg.net.navTimeoutMs });
    await page.waitForTimeout(3500);
    const dashRaw = await extractTimeline(page);

    await page.goto(`${cfg.baseUrl}/calendar/view.php?view=upcoming`, { waitUntil: 'domcontentloaded', timeout: cfg.net.navTimeoutMs });
    await page.waitForTimeout(2000);
    const calRaw = await extractCalendar(page);

    const merged = mergeSources(dashRaw, calRaw);
    const normalized = merged.map((raw) => {
      const item = normalizeItem(account.id, account.label, raw);
      item.dueAt = parseMoodleDate(raw.dateText);
      item.fingerprint = fingerprint(item);
      item.metadataHash = metadataHash(item);
      return item;
    });

    logger.info(`[${account.id}] scraped: ${dashRaw.length} dashboard + ${calRaw.length} calendar → ${normalized.length} normalized`);

    const result = applyChanges(
      { items: prevItems, accounts: globalState.accounts },
      account.id,
      normalized,
      cfg.sanity,
      { notifyInitial: cfg.notifyInitial },
    );

    if (result.guardBlocked) {
      logger.warn(`[${account.id}] guard blocked — ${result.events[0]?.reason}`);
      if (!DRY_RUN && cfg.telegram.token && cfg.telegram.chatId) {
        await notifyAlert(`Parser anomaly (${account.label}): ${result.events[0]?.reason}. State lama dipertahankan.`);
      }
    } else if (result.baselineCreated && !cfg.notifyInitial) {
      logger.info(`[${account.id}] baseline dibuat (${normalized.length} item); notifikasi awal ditahan`);
    }

    if (DRY_RUN) {
      logger.info(`[${account.id}] dry-run: ${result.events.length} event; Telegram dan state write dilewati`);
    } else if (!result.guardBlocked && cfg.telegram.token && cfg.telegram.chatId) {
      for (const event of result.events) {
        const sent = await notifyEvent(event, account.label, false);
        if (!sent?.ok) logger.warn(`[${account.id}] telegram failed for ${event.item?.fingerprint ?? 'unknown'}`);
      }
    }

    return {
      ok: true,
      events: result.events,
      newAccountState: {
        ...result.newAccountState,
        meta: { ...(result.newAccountState.meta ?? {}), failStreak: 0, lastSuccessAt: nowIso },
      },
    };
  } catch (err) {
    const code = err.code ?? 'UNKNOWN';
    logger.error(`[${account.id}] error: ${code} — ${err.message}`);
    const newFailStreak = failStreak + 1;
    if (!DRY_RUN && newFailStreak >= cfg.health.failThreshold && cfg.telegram.token && cfg.telegram.chatId) {
      await notifyAlert(`Monitor gagal ${newFailStreak}x beruntun (${account.label}): ${code}`);
    }
    return {
      ok: false,
      events: [],
      newAccountState: {
        items: prevItems,
        meta: {
          ...(globalState.accounts?.[account.id]?.meta ?? {}),
          failStreak: newFailStreak,
          lastError: code,
          lastErrorAt: nowIso,
        },
      },
      error: code,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const cfg = getConfig();
  if (!cfg.accounts.length) {
    logger.error('ELEARNING_ACCOUNTS kosong/tidak valid — tidak ada akun dikonfigurasi.');
    process.exit(1);
  }

  if (!(await withinWindow(cfg))) {
    logger.info('Di luar jadwal sekolah. Skip. FORCE_RUN=1 untuk paksa.');
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
    const result = await checkAccount(browser, account, globalState, cfg);
    globalState.accounts[account.id] = result.newAccountState;
    globalState.items = Object.values(globalState.accounts).flatMap((value) => Array.isArray(value.items) ? value.items : []);
    if (result.ok) anyOk = true;
    await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));
  }

  await browser.close();
  if (DRY_RUN) {
    logger.info('dry-run selesai; state tidak ditulis');
  } else {
    await saveState(globalState);
  }
  logger.info(`selesai. anyOk=${anyOk}`);
  process.exit(anyOk ? 0 : 1);
}

main().catch((error) => {
  logger.error(`FATAL: ${redact(error.stack ?? String(error.message))}`);
  process.exit(2);
});
