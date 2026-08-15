// Health digest: kirim ringkasan harian 1x per hari (PRD §20 Integration test + NFR-05).
import { getConfig } from './config.js';
import { loadState } from './state.js';
import { notifyHealth } from './telegram.js';
import { logger } from './redact.js';

async function main() {
  const cfg = getConfig();
  const state = await loadState();
  const nowIso = new Date().toISOString();

  // Cek last daily digest — kirim maks 1x per hari
  if (state.lastDailyDigest) {
    const last = new Date(state.lastDailyDigest);
    const jakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const today = `${jakarta.getFullYear()}-${jakarta.getMonth() + 1}-${jakarta.getDate()}`;
    const lastDay = `${last.getFullYear()}-${last.getMonth() + 1}-${last.getDate()}`;
    if (today === lastDay) {
      logger.info('daily digest already sent today, skip');
      process.exit(0);
    }
  }

  const accounts = cfg.accounts;
  const summary = {
    generatedAt: nowIso,
    accounts: accounts.map((a) => {
      const acctState = state.accounts?.[a.id];
      const items = acctState?.items ?? [];
      return {
        label: a.label,
        ok: (acctState?.meta?.failStreak ?? 0) < 3,
        itemCount: items.length,
        eventCount: 0, // TODO: track dari state history
      };
    }),
  };

  if (cfg.telegram.token && cfg.telegram.chatId) {
    await notifyHealth(summary);
    state.lastDailyDigest = nowIso;
    logger.info('daily digest sent');
  } else {
    logger.info('telegram not configured, skip digest');
  }

  process.exit(0);
}

main().catch((e) => {
  logger.error(`FATAL health-digest: ${e.message}`);
  process.exit(2);
});
