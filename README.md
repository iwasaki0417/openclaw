# OpenClaw - パーソナル株式モニタリング環境

## 概要

OpenClawを使った個人向け株式監視・通知システム。
東証・米国市場の定時チェック、ニュースダイジェスト、週次レビュー、決算ウォッチをCronで自動実行する。

## ディレクトリ構成

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

### 1. リポジトリをclone

`~/openclaw` にcloneし、`~/.openclaw` をシンボリックリンクにする:

```bash
git clone git@github.com:iwasaki0417/openclaw.git ~/openclaw
ln -s ~/openclaw ~/.openclaw
```

### 2. OpenClawのインストール

公式の手順に従ってOpenClawをインストールする。
初回セットアップ（onboard）でAnthropicのAPIキーを設定する。

### 3. openclaw.json のパス修正

`openclaw.json` 内の `workspace` パスを新しい環境に合わせて修正:

```json
"workspace": "/Users/<ユーザー名>/.openclaw/workspace"
```

### 4. SSHキーの設定

リモートがSSH接続のため、新しいMacにGitHub用SSHキーを設定しておくこと。

## 運用メモ

- `~/openclaw` が唯一の実体。`~/.openclaw` はそのシンボリックリンク。
- このリポジトリはプライベート運用。SMTP認証情報・APIキーを含む。
- ランタイム生成ファイル（logs, browser, cache等）は `.gitignore` で除外済み。
