# ─── Setup EL Watcher (Langkah demi langkah) ───────────────────────────
# Run ini di terminal PC miro setelah repo di-clone / di-push pertama kali.

## 1. Clone repo (kalau belum ada)
git clone git@github.com:miroapp/el-watcher.git /mnt/disk2/Code/el-watcher
cd /mnt/disk2/Code/el-watcher
npm install

## 2. Setup SSH key buat GitHub (sekali aja)
# Cek apakah udah ada key:
ls ~/.ssh/id_ed25519 ~/.ssh/id_rsa 2>/dev/null
# Kalau belum, generate:
#   ssh-keygen -t ed25519 -C "miro@miro-pc" -f ~/.ssh/id_ed25519
# Copy public key ke GitHub:
#   cat ~/.ssh/id_ed25519.pub
# → Settings → SSH and GPG keys → New SSH key → paste

## 3. Auth GitHub CLI (untuk workflow manage)
# gh perlu login buat push state commit + workflow management
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh -y
gh auth login --hostname github.com

## 4. Buat repo baru di GitHub (sekali)
gh repo create el-watcher --public --source=. --remote=origin --push

## 5. Setup GitHub Secrets (WAJIB — credentials ga boleh di kode)
# Dari repo GitHub → Settings → Secrets and variables → Actions → New repository secret
gh secret set ELEARNING_USER_A --body "USERNAME_SISWA"
gh secret set ELEARNING_PASS_A --body "PASSWORD_SISWA"
gh secret set TELEGRAM_BOT_TOKEN --body "TOKEN_BOT_TELEGRAM"
gh secret set TELEGRAM_CHAT_ID --body "5973612133"

## 6. Setup environment file lokal (untuk systemd / manual run)
cp .env.example .env
# Edit .env, isi username/password Telegram:
nano .env
chmod 600 .env

## 7. Setup systemd timer (PC miro — monitoring lokal)
cp deploy/*.service ~/.config/systemd/user/
cp deploy/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now el-watcher.timer
systemctl --user enable --now el-watcher-health.timer
systemctl --user list-timers --all | grep el-

## 8. Test manual (sekali, tanpa notifikasi Telegram)
FORCE_RUN=1 node src/monitor.js --dry-run 2>&1

## 9. Debug scrape (sekali, browser interaktif)
# Masukin username/password Moodle:
node src/debug-scrape.js <USER> <PASS>
# Ini buka Chrome visible, login, scrape, dump JSON fixture.
# Review fixture sebelum commit ke tests/fixtures/

## 10. Install ulang (kalau layout Moodle berubah)
# 1. Update selectors/ di src/parser.js
# 2. Jalankan debug-scrape → perbarui fixtures
# 3. npm run test
# 4. git add -A && git commit && git push
