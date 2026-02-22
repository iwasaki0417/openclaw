# TOOLS.md - パーソナルClaw 環境メモ

## ワークスペース

- このディレクトリ: `~/.openclaw/workspace/`

## 記憶

- `memory/watchlist.json` — 監視銘柄リスト（ticker, アラート閾値）
- `memory/stock-history.json` — 直近の株価データ

## 株価API

Yahoo Finance v8:

```bash
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=1d"
```

- 東証: `{コード}.T`（例: `7203.T` = トヨタ）
- 指数: `^N225`（日経平均）, `^TOPX`（TOPIX）

## macOS通知

```bash
osascript -e 'display notification "本文" with title "タイトル" sound name "Glass"'
```
