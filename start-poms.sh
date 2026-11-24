#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  POMS V3 - مكتب النائب محمد كليب (التشغيل المحلي والشبكي)"
echo "============================================================"

# Ensure common Node.js / npm / version-manager paths are in PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.bun/bin:$HOME/.volta/bin:$HOME/.fnm/aliases/default/bin:$PATH"

# Load nvm if installed
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

# Load fnm if installed
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd 2>/dev/null || true)"
fi

# Load asdf if installed
if [ -s "$HOME/.asdf/asdf.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.asdf/asdf.sh"
fi

# Locate node binary (including standard nodejs binary name on Debian/Kali)
NODE_BIN="$(command -v node 2>/dev/null || command -v nodejs 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  echo "[خطأ] بيئة Node.js غير مثبّتة على هذا الجهاز."
  echo "لتثبيت Node.js و npm على Kali / Ubuntu / Debian نفّذ:"
  echo "  sudo apt update && sudo apt install -y nodejs npm"
  echo "أو على macOS عبر Homebrew:"
  echo "  brew install node"
  exit 1
fi

# Ensure the directory containing node is prioritized in PATH
NODE_DIR="$(dirname "$NODE_BIN")"
export PATH="${NODE_DIR}:$PATH"

# Detect package manager (npm / pnpm / yarn / bun)
PKG_MGR=""
if command -v npm >/dev/null 2>&1; then
  PKG_MGR="npm"
elif [ -x "${NODE_DIR}/npm" ]; then
  PKG_MGR="${NODE_DIR}/npm"
elif command -v pnpm >/dev/null 2>&1; then
  PKG_MGR="pnpm"
elif command -v bun >/dev/null 2>&1; then
  PKG_MGR="bun"
elif command -v yarn >/dev/null 2>&1; then
  PKG_MGR="yarn"
fi

echo "[البيئة] Node: $($NODE_BIN -v 2>/dev/null || echo "$NODE_BIN")"

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsx" ]; then
  if [ -z "$PKG_MGR" ]; then
    echo "[خطأ] تم العثور على Node.js ($NODE_BIN) لكن مدير الحزم npm غير مثبت."
    echo "لتثبيت npm على Kali / Ubuntu / Debian نفّذ:"
    echo "  sudo apt update && sudo apt install -y npm"
    exit 1
  fi
  echo "[1/3] جارٍ تثبيت الحزم البرمجية عبر ${PKG_MGR}..."
  "$PKG_MGR" install
else
  echo "[1/3] الحزم البرمجية مثبتة وجاهزة."
fi

echo ""
echo "[2/3] عناوين تشغيل النظام على الهواتف وأجهزة الكمبيوتر المتصلة بنفس الواي فاي:"
echo "  -> على هذا الجهاز: http://localhost:3000"
if command -v hostname >/dev/null 2>&1; then
  for ip in $(hostname -I 2>/dev/null || true); do
    if [[ "$ip" != 127.* && "$ip" != *:* ]]; then
      echo "  -> على الهواتف والأجهزة الأخرى: http://${ip}:3000"
    fi
  done
fi
echo "  -> بوابة تسجيل المواطنين: /register"
echo ""
echo "[3/3] جارٍ تشغيل الخادم على المنفذ 3000..."

if [ -n "$PKG_MGR" ]; then
  exec "$PKG_MGR" run dev
else
  exec "$NODE_BIN" ./node_modules/.bin/tsx server.ts
fi
