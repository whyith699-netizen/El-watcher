#!/usr/bin/env bash
# push.sh — push el-watcher to GitHub. Run setelah GitHub repo dibuat + SSH key ditambahkan.
set -e
cd "$(dirname "$0")"

echo "=== EL Watcher Push ==="

# 1. Buat repo GitHub (sekali aja, via web browser / gh cli)
echo "[1] Buka https://github.com/new — repo name: el-watcher — Public — NO README"
echo "    Atau via gh: gh repo create el-watcher --public --source=. --push"
read -p "Tekan Enter setelah repo dibuat..."

# 2. Add remote SSH key ke GitHub
echo "[2] Add SSH key ke GitHub:"
echo "    1. Copy: cat ~/.ssh/id_ed25519_remote.pub"
echo "    2. Buka https://github.com/settings/keys → New SSH key"
echo "    3. Paste + Save"
read -p "Tekan Enter setelah key ditambahkan..."

# 3. Push
echo "[3] Pushing..."
git push -u origin HEAD 2>&1
echo "=== Done ==="