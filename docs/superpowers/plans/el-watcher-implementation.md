# EL Watcher — Implementation Plan

## Context
- **PRD**: E-Learning Assignment & UH Monitor (el-watcher)
- **Platform**: Moodle 3.x @ https://elearning.sma1klaten.sch.id
- **Repository**: `/mnt/disk2/Code/el-watcher` (push pending — repo miroapp/el-watcher belum dibuat)
- **Stack**: Node.js ≥ 20, playwright-core + Chrome sistem, Telegram Bot API
- **PRD Source**: `/tmp/elwatch/Private & Shared/PRD тАФ E-Learning Assignment & UH Monitor ffb13c09c6c94dfaaafdf46b0edfe5c2.md`
- **PRD Requirements**: FR-01 to FR-12 (monitoring), NFR-01 to NFR-08 (non-functional)

## Status: Fully Scaffolded ✓
All scaffolding complete. Git push pending user action.

## Repository Structure
```
el-watcher/
├── src/
│   ├── monitor.js         # orchestrator (login → scrape → normalize → diff → notify)
│   ├── auth.js            # (placeholder — login handled inline in monitor.js)
│   ├── browser.js         # (placeholder — chromium launched inline)
│   ├── fetcher.js         # (placeholder — page.goto inline)
│   ├── parser.js          # extractTimeline/extractCalendar + SELECTORS
│   ├── normalize.js       # normalizeTitle/parseMoodleDate/typeFromUrl/fingerprint/metadataHash
│   ├── diff.js            # diffItems/sanityCheck
│   ├── changes.js         # applyChanges (diff + guard per account)
│   ├── telegram.js        # notifyEvent/notifyAlert/notifyHealth/sendWithRetry
│   ├── state.js           # loadState/saveState (atomic JSON + .bak)
│   ├── redact.js          # redact + structured logger
│   ├── config.js          # getConfig/loadAccounts/accountsFromEnv (all env)
│   ├── health-digest.js   # daily digest at 19:00 WIB
│   └── debug-scrape.js    # interactive debug: node src/debug-scrape.js <user> <pass>
│       └── health-digest.js
├── selectors/
│   └── sma1klaten.js     # Moodle selector constants (swap when layout changes)
├── deploy/
│   ├── el-watcher.service         # systemd oneshot service
│   ├── el-watcher.timer           # OnUnitActiveSec=5min + jitter 45s
│   ├── el-watcher-health.service  # daily digest
│   └── el-watcher-health.timer    # daily at 19:00 WIB
├── .github/workflows/
│   └── monitor.yml        # GH Actions: cron */5 23:00-11:00 UTC, state commit
├── tests/
│   ├── normalize.test.js  # 31 tests: normalize/parse/typeFromUrl/fingerprint/diff/sanity/redact
│   └── parser.test.js     # mergeSources tests
└── state/
    └── .gitkeep
```

## Completed
| # | Component | Status |
|---|-----------|--------|
| 1 | Package scaffold + dependencies | ✅ |
| 2 | All source files (monitor, parser, normalize, diff, telegram, state, config, redact, health-digest, debug-scrape) | ✅ |
| 3 | Selector file (Moodle 3.x / Boost) | ✅ |
| 4 | systemd service + timer units | ✅ |
| 5 | GH Actions workflow | ✅ |
| 6 | Unit tests: **31/31 passing** | ✅ |
| 7 | Syntax check: all files clean | ✅ |
| 8 | .gitignore, .env.example, README.md, SETUP.md, push.sh | ✅ |

## Pending Actions (USER)

### 1. Buat repo GitHub (1 menit, manual)
```
Buka https://github.com/new
Repo name: el-watcher
Public / Private无所谓
NO Initialize this repository with README
Create repository

Catat SSH URL: git@github.com:miroapp/el-watcher.git
```

### 2. Add SSH key ke GitHub
```bash
# Copy public key:
cat ~/.ssh/id_ed25519_remote.pub

# GitHub → Settings → SSH and GPG keys → New SSH key → paste
```

### 3. Push
```bash
cd /mnt/disk2/Code/el-watcher
./push.sh
# Atau manual:
git remote set-url origin git@github.com:miroapp/el-watcher.git
git push -u origin master
```

### 4. Setup secrets di GitHub (Settings → Secrets → Actions)
```
ELEARNING_USER_A = username_siswa
ELEARNING_PASS_A = password_siswa
TELEGRAM_BOT_TOKEN = 123456:ABC-xxx
TELEGRAM_CHAT_ID = 5973612133
```

### 5. Setup systemd (PC miro)
```bash
cp /mnt/disk2/Code/el-watcher/deploy/*.service ~/.config/systemd/user/
cp /mnt/disk2/Code/el-watcher/deploy/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now el-watcher.timer
systemctl --user list-timers --all | grep el
```

### 6. Setup .env lokal
```bash
cp /mnt/disk2/Code/el-watcher/.env.example /mnt/disk2/Code/el-watcher/.env
nano /mnt/disk2/Code/el-watcher/.env  # isi credentials
chmod 600 /mnt/disk2/Code/el-watcher/.env
```

### 7. Test run
```bash
# Dry run (tidak kirim Telegram)
FORCE_RUN=1 node /mnt/disk2/Code/el-watcher/src/monitor.js --dry-run

# Interaktif debug (browser visible)
node /mnt/disk2/Code/el-watcher/src/debug-scrape.js <USER> <PASS>
```

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Browser automation (Playwright) over WebService API | Moodle WebService mati → harus scrape HTML |
| State per-account items array (global deduplication by fingerprint) | Fingerprint = accountId+course+type+title+url |
| Sanity guard: >60% item drop → block notification | PRD NFR-03: anti false-positive dari layout change |
| GH Actions budget: 2.000 menit/bulan free tier | Cukup untuk interval 30 menit; systemd timer di PC = 5 menit gratis |
| systemd timer preferred over GH Actions | IP residensial = Cloudflare tidak nge-blok, interval 5 menit benar |
| 3 retry for Telegram, fail-open | PRD §15: event tidak hilang karena notif gagal |
| Guard jam sekolah (06-18 WIB) di script | systemd timer tidak bisa filter kalender Indonesia |

## Monitoring Flow
```
Timer fires (every 5min)
  → monitor.js
    → cek window (Sen-Sab 06-18 WIB) → skip if outside
    → login Moodle (username + password + logintoken)
    → /my/ timeline (AJAX wait 3.5s)
    → /calendar/view.php?view=upcoming (AJAX wait 2s)
    → extract + merge + normalize
    → diff vs state (fingerprint-based)
    → sanity guard (>60% drop = block)
    → notify Telegram (prioritas 🚨>📝>📢>⚠️)
    → save state (atomic JSON + .bak)
```

## Anti-Feedback Loop (PRD §15)
- Sanity guard (NFR-03): block kalau item turun >60%
- Guard jam sekolah: outside window = no check
- Per-account state: akun lain tidak affect satu akun lain
- 3x fail streak → alert Telegram → human intervention

## Known Unknowns (PRD section "Files and Config")
- Database connection string → tidak perlu (MVP state = JSON)
- S3 bucket config → tidak perlu (MVP tidak store attachment)
- Email credentials → tidak perlu (Telegram only)
- Google OAuth → tidak perlu (Moodle native login)
- Canvas API credentials → tidak relevan
- GitHub token → tidak untuk MVP; bisa dipakai untuk state commit
