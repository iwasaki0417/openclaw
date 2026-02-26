#!/bin/bash
# daily-news-runner.sh — Claude Codeで OpenClaw News を生成・送信する
#
# 使い方:
#   手動実行: ~/.openclaw/workspace/scripts/daily-news-runner.sh
#   launchd:  毎朝7時(JST)に自動実行

set -euo pipefail

WORKSPACE="$HOME/.openclaw/workspace"
LOG_DIR="$WORKSPACE/memory/daily-news-logs"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$DATE.log"

mkdir -p "$LOG_DIR"

export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() {
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== OpenClaw News 開始 ==="

if ! command -v claude &>/dev/null; then
	log "ERROR: claude CLI が見つかりません"
	exit 1
fi

log "Claude Code $(claude --version) を使用"

claude -p \
	--model sonnet \
	--allowedTools "Bash(curl:*,python3:*,cp:*,cat:*,ls:*,sleep:*,osascript:*,date:*,mkdir:*)" Read Write \
	--dangerously-skip-permissions \
	--max-budget-usd 3.00 \
	--no-session-persistence \
	"あなたのワークスペースは $WORKSPACE です。
$WORKSPACE/DAILY-NEWS.md を読み、Step 0 から Step 8 まで全ステップを厳密に順番通り実行せよ。
ステップを省略するな。各APIリクエスト間のsleepも守れ。
HTMLテンプレートを絶対に変更するな。
最後に必ず send-email.py でメール送信を完了させよ。" \
	>> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
	log "=== OpenClaw News 完了 (exit: $EXIT_CODE) ==="
else
	log "=== OpenClaw News 失敗 (exit: $EXIT_CODE) ==="
fi

# 古いログを30日分だけ保持
find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true

exit $EXIT_CODE
