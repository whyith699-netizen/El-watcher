# EL Watcher — E-Learning Assignment & UH Monitor

Pemantau dashboard e-learning SMA Negeri 1 Klaten (Moodle) → notifikasi Telegram.
Implementasi PRD "E-Learning Assignment & UH Monitor" (EL Watcher).

## Cara kerja

```
systemd timer / GitHub Actions / manual
        |
        v
  monitor.js
    ├─ cek jadwal (Asia/Jakarta, hari & jam sekolah)
    ├─ per akun (A, B, ...):
    │    ├─ login Moodle (form username/password + logintoken)
    │    ├─ buka /my/ (timeline) + /calendar/view.php?view=upcoming
    │    ├─ parser → normalisasi → fingerprint
    │    ├─ diff vs state → event (created/updated/available/removed)
    │    ├─ sanity guard (anti false-positive banjir)
    │    └─ notifikasi Telegram (prioritas 🚨/📝/📢/⚠️)
    └─ state JSON atomik + backup
```

## Stack

- Node.js ≥ 20 (tanpa TypeScript — keep simple, cukup JSDoc)
- playwright-core + Chrome sistem (`/usr/bin/google-chrome-stable`)
- Telegram Bot API (fetch bawaan Node)
- State: `state/state.json` (+ .bak), commit opsional
- Test: `node --test`

## Setup

```bash
cd /mnt/disk2/Code/el-watcher
npm install          # playwright-core saja
node --test tests/   # unit test parser/normalize/diff/redact
```

## Environment variables

Simpan di `EnvironmentFile` systemd (mis. `/mnt/disk2/Code/el-watcher/.env`, CHMOD 600):

```bash
ELEARNING_BASE_URL=https://elearning.sma1klaten.sch.id
ELEARNING_ACCOUNTS=a:XI-A:ELEARNING_USER_A:ELEARNING_PASS_A,b:XI-B:ELEARNING_USER_B:ELEARNING_PASS_B
ELEARNING_USER_A=...
ELEARNING_PASS_A=...
ELEARNING_USER_B=...
ELEARNING_PASS_B=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
# opsional:
# ELW_STATE_PATH=./state/state.json
# ELW_DEBUG=1
```

> Akun dinonaktifkan = hapus baris usernamenya dari env → akun dilewati tanpa mengubah akun lain.

## Deploy

### systemd (default, PC miro)

```bash
cp deploy/el-watcher.service deploy/el-watcher.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now el-watcher.timer
```

Timer: `OnCalendar=*:0/5` + jitter 30s. Guard jam sekolah tetap di script.

### GitHub Actions (opsional)

Repo harus **privat**. Workflow `.github/workflows/monitor.yml`:
- `schedule: cron "*/5 23-10 * * 1-5"` (UTC) + `workflow_dispatch`
- Secrets: `ELEARNING_*`, `TELEGRAM_*`
- ⚠️ Free tier privat = 2.000 menit/bulan → jangan pakai cron 5 menit di hosted runner;
  interval lebih longgar (30 menit) atau self-hosted runner di PC.

## Keamanan

- Credential hanya via env / GitHub Secrets.
- Log terstruktur + redaksi otomatis (username/password/token/cookie).
- Tidak menyimpan isi soal/jawaban — metadata saja.
- Screenshot debug off default; `.env` dan `state/` di-`.gitignore`.
- Jangan bypass CAPTCHA/2FA/rate-limit. Kalau muncul → fail closed + alert.

## Testing

```bash
node --test tests/            # semua unit test
npm run monitor -- --dry-run  # tanpa kirim notifikasi
```

## Troubleshooting

| Gejala | Cek |
| --- | --- |
| Login gagal | `.env` user/pass benar? logintoken berubah? log redacted |
| Parser 0 item | selector di `src/parser.js` — layout Moodle berubah, update + fixture baru |
| Notif ga masuk | `TELEGRAM_CHAT_ID` (chat pribadi = ID user), token bot |
| Timer ga jalan | `systemctl --user list-timers el-watcher` |

## Pencabutan akun

1. Hapus `ELEARNING_USER_B`/`ELEARNING_PASS_B` dari env + entry di `ELEARNING_ACCOUNTS`.
2. Hapus secret GitHub (kalau pakai Actions).
3. Bersihkan state akun: `jq 'del(.items[] | select(.accountId=="b"))' state/state.json`.

## Struktur

```
el-watcher/
├── src/
│   ├── monitor.js       # orchestrator utama
│   ├── auth.js          # login Moodle
│   ├── browser.js       # launch + retry helper
│   ├── fetcher.js       # navigasi /my/ + /calendar
│   ├── parser.js        # selector + ekstraksi DOM
│   ├── normalize.js     # normalisasi + fingerprint
│   ├── diff.js          # diff + sanity guard
│   ├── telegram.js      # notifikasi prioritas
│   ├── state.js         # load/save atomik
│   ├── redact.js        # redaksi + logger
│   └── config.js        # env + jadwal + sanity cfg
├── tests/               # node:test + fixtures
├── deploy/              # systemd unit + .env.example
└── state/               # state.json (gitignored)
```
