# Daily News アーキテクチャ

```
macOS launchd（OSのスケジューラ）
  │
  ▼
daily-news-runner.sh（ラッパースクリプト）
  │
  ▼
claude -p --model sonnet（Claude Code CLI）
  │  「DAILY-NEWS.mdを読んで全ステップ実行せよ」
  │
  ▼  Claude Codeが自律的にDAILY-NEWS.mdを読み、以下を順番に実行：
  │
  ├─ Step 0: watchlist.json, stock-history.json, dca-schedule.json を読む
  │
  ├─ Step 1: Yahoo Finance APIをcurlで14銘柄分呼び出し、週間パフォーマンス取得
  │
  ├─ Step 2: Brave Search APIで10銘柄の決算日をチェック
  │
  ├─ Step 3: Brave Search APIで8カテゴリのニュースを収集（計12リクエスト）
  │
  ├─ Step 4: QuickChartで横棒グラフPNG画像を生成
  │
  ├─ Step 5: 全データを分析・フィルタリング（影響度タグ、KEY DRIVERS、セクター展望）
  │
  ├─ Step 6: DAILY-NEWS.mdのHTMLテンプレートに沿ってメール本文を生成
  │
  ├─ Step 7: send-email.py でGmail SMTP経由でメール送信（チャート画像埋め込み）
  │
  └─ Step 8: macOS通知を表示
```

## 役割分担

| | OpenClaw | Claude Code |
|---|---|---|
| **役割** | LINEでの対話・通知 | 重い定期バッチ処理 |
| **例** | 東証後場チェック・日常会話 | daily-news メール生成・送信 |
| **モデル** | Sonnet | Sonnet |
| **スケジューラ** | OpenClaw cron | macOS launchd |

## ファイル

- スクリプト: `~/.openclaw/workspace/scripts/daily-news-runner.sh`
- 手順書: `~/.openclaw/workspace/DAILY-NEWS.md`
- launchd: `~/Library/LaunchAgents/com.openclaw.daily-news.plist`
- ログ: `~/.openclaw/workspace/memory/daily-news-logs/YYYY-MM-DD.log`

## 経緯（2026-02-26）

OpenClawのcronジョブでは以下の問題があり、Claude Codeに移行:
1. Haiku → 手順を無視して架空ニュースを生成
2. Sonnet → トークン上限に達してメール送信まで辿り着けない
3. payload.model の指定がGatewayに無視される

Claude Code CLIなら トークン制限なし・$3予算で全8ステップを完走できる。
