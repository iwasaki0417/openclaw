# TOOLS.md - パーソナルClaw 環境メモ

## ワークスペース
- このディレクトリ: `~/.openclaw/workspace/`

## 記憶
- `memory/watchlist.json` — 監視銘柄リスト（ticker, アラート閾値, spotBuy通知）
- `memory/stock-history.json` — 直近の株価データ・SBIスナップショット
- `memory/dca-schedule.json` — 定期積立スケジュール（毎月の買付計画）

## 株価API
Yahoo Finance v8:
curl -s -A "Mozilla/5.0 ..." "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=1d"

- 東証: `{コード}.T`（例: `7203.T` = トヨタ）
- 指数: `^N225`（日経平均）, `^GSPC`（S&P500）
- 為替: `USDJPY=X`（USD/JPYレート）

## ニュース検索API
Brave Search API（月1,000回無料）:

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q={検索クエリ}&count=5&search_lang=en&freshness=pd" \
  --compressed
```

- ニュース検索: `/res/v1/news/search` — 直近のニュース（freshness=pd で過去24時間）
- Web検索: `/res/v1/web/search` — 一般的なWeb検索
- クエリ例: `q=NVDA+stock+earnings`, `q=silver+price+drop+reason`

## macOS通知
osascript -e 'display notification "本文" with title "タイトル" sound name "Glass"'
