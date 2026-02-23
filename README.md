# OpenClaw - パーソナル株式モニタリング環境

## 概要

OpenClawを使った個人向け株式監視・通知システム。
東証・米国市場の定時チェック、ニュースダイジェスト、週次レビュー、決算ウォッチをCronで自動実行する。

## 構成

```
openclaw.json          # OpenClaw本体設定
agents/main/           # エージェント定義
  HEARTBEAT.md         #   定時株価チェック
  DAILY-NEWS.md        #   デイリーニュースダイジェスト
  EARNINGS.md          #   決算ウォッチャー
  WEEKLY-REVIEW.md     #   週次ポートフォリオ診断
cron/jobs.json         # Cronジョブスケジュール
workspace/
  TOOLS.md             #   利用可能ツール・APIメモ
  memory/              #   永続データ
    watchlist.json     #     監視銘柄リスト
    stock-history.json #     株価履歴
    dca-schedule.json  #     積立スケジュール
    email-config.json  #     メール送信設定（SMTP認証情報）
  scripts/
    send-email.py      #     メール送信スクリプト
    import-sbi-csv.py  #     SBI証券CSVインポート
```

## 別Macへのセットアップ手順

### 1. OpenClawのインストール

公式の手順に従ってOpenClawをインストールする。

### 2. このリポジトリをclone

```bash
git clone git@github.com:iwasaki0417/openclaw.git ~/openclaw
```

### 3. OpenClawのホームディレクトリにファイルを反映

OpenClawは `~/.openclaw/` を実行ディレクトリとして使う。
cloneしたファイルを反映する:

```bash
# ~/.openclaw/ が既に存在する場合、追跡対象ファイルだけをコピー
cp openclaw.json ~/.openclaw/
cp -r agents/ ~/.openclaw/agents/
cp -r cron/jobs.json ~/.openclaw/cron/
cp -r workspace/ ~/.openclaw/workspace/
```

### 4. openclaw.json のパス修正

`openclaw.json` 内の `workspace` パスを新しい環境に合わせて修正する:

```json
"workspace": "/Users/<新ユーザー名>/.openclaw/workspace"
```

### 5. Anthropic APIキーの設定

OpenClawのセットアップウィザード（`onboard`）でAnthropicのAPIキーを設定する。

## 注意事項

- このリポジトリはプライベート運用。SMTP認証情報・APIキーを含む。
- `openclaw.json` の `gateway.auth.token` はローカル通信用。移行先で再生成してもよい。
