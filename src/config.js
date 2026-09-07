// EL Watcher — konfigurasi runtime dari env + defaults.
// Semua credential via env, tidak pernah hardcode.

export const BASE_URL = process.env.ELEARNING_BASE_URL || "https://elearning.sma1klaten.sch.id";
export const DRY_RUN = process.argv.includes("--dry-run");
export const VERBOSE = process.argv.includes("--verbose");

export const WINDOW = {
  tz: "Asia/Jakarta",
  default: { days: [1, 2, 3, 4, 5], start: "05:30", end: "17:30" },
  overrides: [{ days: [6], start: "07:00", end: "12:00" }],
};

export function accountsFromEnv() {
  const out = [];
  const seen = new Set();
  const raw = process.env.ELEARNING_ACCOUNTS || "";
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const fields = part.split(":").map((s) => s.trim());
    if (fields.length !== 4) continue;
    const [id, label, userEnv, passEnv] = fields;
    if (!id || !label || !userEnv || !passEnv || seen.has(id)) continue;
    const username = process.env[userEnv];
    const password = process.env[passEnv];
    if (!username || !password) continue;
    seen.add(id);
    out.push({ id, label, username, password, userEnv, passEnv });
  }
  return out;
}

export function loadAccounts() { return accountsFromEnv(); }

export const STATE_PATH = process.env.ELW_STATE_PATH || "./state/state.json";
export const STATE_COMMIT = process.env.ELW_STATE_COMMIT === "1";
export const NOTIFY_INITIAL = process.env.ELW_NOTIFY_INITIAL === "1";

export const TELEGRAM = {
  token: process.env.TELEGRAM_BOT_TOKEN || "",
  chatId: process.env.TELEGRAM_CHAT_ID || "",
};

export const SANITY = { maxDropRatio: 0.5, maxNewBurst: 15, minBaseline: 5 };
export const HEALTH = { dailyKey: "lastDailyHealth", failThreshold: 3 };
export const NET = { navTimeoutMs: 30_000, retryMax: 2, retryBackoffMs: 5_000 };

export function getConfig() {
  return {
    baseUrl: BASE_URL,
    accounts: accountsFromEnv(),
    telegram: TELEGRAM,
    window: WINDOW,
    sanity: SANITY,
    health: HEALTH,
    net: NET,
    notifyInitial: NOTIFY_INITIAL,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  };
}
