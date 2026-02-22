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
```

全銘柄を1つずつ取得。各リクエスト間に `sleep 2`。

### 為替レート取得（米国株チェック時）

米国株を取得する際は、最初に USD/JPY レートを取得する。

```bash
curl -s -A "$UA" "https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X?interval=1d&range=1d" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
meta = d['chart']['result'][0]['meta']
print(meta['regularMarketPrice'])
"
```

取得した為替レートを全米国株の円換算に使用する。

### 損益計算

**日本株:**
- 評価損益 = (現在値 - 取得単価) × 保有数量
- 損益率 = (現在値 - 取得単価) / 取得単価 × 100

**米国株（USD建て + 円換算）:**
- 評価損益(USD) = (現在値 - 取得単価) × 保有数量
- 円換算評価額 = 現在値 × 保有数量 × USD/JPYレート
- 円換算評価損益 = 評価損益(USD) × USD/JPYレート

## Step 3: アラート判定 + 理由検索

- `changePct` ≤ `alertDown` → 📉 急落アラート
- `changePct` ≥ `alertUp` → 📈 急騰アラート

### アラート発火時: Brave Searchで理由を取得

アラート条件に該当した銘柄について、Brave News APIで直近ニュースを検索する。

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q={TICKER}+stock&count=3&search_lang=en&freshness=pd" \
  --compressed \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('results', [])[:3]:
    print(r.get('title', ''))
"
```

取得したニュース見出し（最大3件）の中から、値動きの理由として最も関連性の高い1件を選び、通知に含める。
ニュースが見つからない場合は「要因: 不明（ニュースなし）」とする。

**日本株アラート例:**
```bash
osascript -e 'display notification "SPDRゴールド +3.5%（71,640円）\n評価益: +2,676,556円\n📰 金先物が最高値更新" with title "📈 株価アラート" sound name "Glass"'
```

**米国株アラート例（円換算併記）:**
```bash
osascript -e 'display notification "NVDA +5.2%（$189.82 / ¥29,472）\n評価益: +$783 / +¥121,566\n📰 AI半導体需要が予想上回る" with title "📈 株価アラート" sound name "Glass"'
```

## Step 3.5: スポット買い通知

watchlist.json の `spotBuy` セクションを確認する。
各銘柄の現在値が `levels` のいずれかの `price` 以下になった場合、買い場通知を出す。

下のレベルほど優先度が高い（複数ヒット時は最も低い価格のレベルで通知）。

```bash
osascript -e 'display notification "TSM $296（-20%）\n📢 買い場接近\n推奨: 16株（約74万円）" with title "🛒 スポット買いチャンス" sound name "Submarine"'
```

通知は**1銘柄につき同じレベルで1日1回まで**。同じレベルが連日続く場合は毎日通知する。

## Step 4: サマリー通知

大引後の初回チェックで日次サマリーを `display notification` で通知。

**米国株サマリーには為替レートと円換算合計を含める:**
```bash
osascript -e 'display notification "USD/JPY: 155.30\nNVDA $189.82(+1.2%) ¥29,472\nTSLA $411.82(-0.3%) ¥63,956\n米国株合計: ¥4,794,338" with title "📊 米国 終値" sound name "Purr"'
```

stock-history.json を更新。為替レートも記録する:
```json
{
  "lastChecked": "2026-02-22T06:10:00+09:00",
  "lastSummary": { "jp": "2026-02-22", "us": "2026-02-22" },
  "usdjpy": 155.30,
  "prices": {
    "1326.T": { "price": 71640, "changePct": 0.8, "pnl": 2676556, "at": "..." },
    "NVDA": { "price": 189.82, "changePct": 1.2, "pnlUsd": 783.30, "pnlJpy": 121566, "at": "..." }
  }
}
```

## Step 5: 結果返却

- アラートあり → `[Heartbeat] 株価アラート: {銘柄名} {changePct}%`
- サマリー通知 → `[Heartbeat] 終値サマリー送信（JP/US）`
- 何もなし → `HEARTBEAT_OK`

## 禁止事項

1. watchlist.jsonにない銘柄を勝手に追加しない
2. alertDown/alertUpの閾値を変更しない
3. 通知を英語で出さない
4. 売買判断・推奨を出さない — 事実のみ通知
