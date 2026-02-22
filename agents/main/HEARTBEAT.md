# Heartbeat: 株価モニタリング

> パーソナルClaw。保有銘柄（日本株・米国株）を定期チェックし、macOS通知で知らせる。

---

## Step 0: 準備

```bash
cat ~/.openclaw/workspace/memory/watchlist.json
cat ~/.openclaw/workspace/memory/stock-history.json
```

watchlist.json の `stocks_jp`, `stocks_us`, `indices` を読み取る。

## Step 1: 市場時間チェック

```bash
date "+%u %H%M"
```

| 条件 | 判定 |
|---|---|
| 土日（6,7） | → Step 5（`HEARTBEAT_OK`） |
| 平日 0900〜1525 | 東証取引時間 → Step 2（日本株 + 指数） |
| 平日 2330〜翌0500 | 米国取引時間（JST） → Step 2（米国株 + S&P500） |
| 平日 1530〜1600 | 東証大引後 → Step 2（日本株サマリー） |
| 平日 0500〜0600 | 米国大引後（JST） → Step 2（米国株サマリー） |
| それ以外 | → Step 5 |

## Step 2: 株価取得

**⚠️ User-Agentヘッダー必須。未設定だと429エラーになる。**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

# 日本株（例: 1326.T）
curl -s -A "$UA" "https://query1.finance.yahoo.com/v8/finance/chart/1326.T?interval=1d&range=1d" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
r = d['chart']['result'][0]
meta = r['meta']
print(json.dumps({
  'ticker': meta['symbol'],
  'price': meta['regularMarketPrice'],
  'prevClose': meta['chartPreviousClose'],
  'change': round(meta['regularMarketPrice'] - meta['chartPreviousClose'], 2),
  'changePct': round((meta['regularMarketPrice'] - meta['chartPreviousClose']) / meta['chartPreviousClose'] * 100, 2)
}))
"

# 米国株も同じ形式（ticker部分を変えるだけ）
```

全銘柄を1つずつ取得する。レート制限回避のため各リクエスト間に `sleep 2` を入れる。

**損益計算:**
各銘柄の `cost`（取得単価）と `shares`（保有数量）から評価損益を算出する。

```
評価損益 = (現在値 - 取得単価) × 保有数量
損益率 = (現在値 - 取得単価) / 取得単価 × 100
```

## Step 3: アラート判定

各銘柄について:
1. `changePct`（前日比）が `alertDown` 以下 → 📉 急落アラート
2. `changePct`（前日比）が `alertUp` 以上 → 📈 急騰アラート

**アラートがある場合:**

```bash
osascript -e 'display notification "SPDRゴールド +3.5%（71,640円）\n評価益: +2,676,556円" with title "📈 株価アラート" sound name "Glass"'
```

## Step 4: サマリー通知

大引後（東証15:30頃 / 米国05:00頃JST）の初回チェックで日次サマリーを送る。

stock-history.json の `lastSummary.jp` / `lastSummary.us` が本日でなければサマリーを通知。

**日本株サマリー例:**

```bash
osascript -e 'display notification "日経平均 39,150 (+0.3%)
SPDRゴールド 71,640 (+0.8%) 損益+2,676,556
純銀信託 36,300 (+1.2%) 損益+154,537" with title "📊 東証 終値" sound name "Purr"'
```

**米国株サマリー例:**

```bash
osascript -e 'display notification "S&P500 6,120 (+0.5%)
NVDA 189.82 (+1.2%) TSM 370.54 (+0.8%)
TSLA 411.82 (-0.3%) MDB 344.56 (+2.1%)" with title "📊 米国 終値" sound name "Purr"'
```

**状態更新:**

stock-history.json を更新:

```json
{
  "lastChecked": "2026-02-17T15:30:00+09:00",
  "lastSummary": { "jp": "2026-02-17", "us": "2026-02-17" },
  "prices": {
    "1326.T": { "price": 71640, "changePct": 0.8, "pnl": 2676556, "at": "..." },
    "NVDA": { "price": 189.82, "changePct": 1.2, "pnl": 783.30, "at": "..." }
  }
}
```

## Step 5: 結果返却

- アラートあり → `[Heartbeat] 株価アラート: {銘柄名} {changePct}%`
- サマリー通知 → `[Heartbeat] 終値サマリー送信（JP/US）`
- 何もなし → `HEARTBEAT_OK`

---

## 禁止事項

1. **watchlist.json にない銘柄を勝手に追加しない**
2. **alertDown/alertUp の閾値を変更しない**
3. **通知を英語で出さない** — 全て日本語
4. **売買判断・推奨を出さない** — 事実（価格・変動率・損益）のみ通知
