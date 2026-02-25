# Heartbeat: 株価モニタリング + スマートDCA

> パーソナルClaw。保有銘柄（日本株・米国株）を定期チェックし、LINE / macOS通知で知らせる。
> スマートDCA戦略（指値・曜日・20EMA）の判定も行う。

---

## Step 0: 準備

```bash
cat ~/.openclaw/workspace/memory/watchlist.json
cat ~/.openclaw/workspace/memory/stock-history.json
cat ~/.openclaw/workspace/memory/smart-dca-config.json
```

watchlist.json の `stocks_jp`, `stocks_us`, `indices` を読み取る。
smart-dca-config.json の戦略設定（`limitOrder`, `weekdayBias`, `ema20`）を読み取る。

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

## Step 2.5: スマートDCA判定

smart-dca-config.json の `strategies` を参照し、有効な戦略を順に判定する。

### A. 前週終値からの指値判定（limitOrder）

**月曜の初回Heartbeat時:** 各対象銘柄の前週金曜終値を取得し `weeklyCloseCache` に保存する。

```bash
curl -s -A "$UA" "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=5d" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
closes = d['chart']['result'][0]['indicators']['quote'][0]['close']
valid = [c for c in closes if c is not None]
print(json.dumps({'prevWeekClose': valid[-1] if valid else None}))
"
```

取得後、smart-dca-config.json の `weeklyCloseCache` を更新:
```json
{ "weeklyCloseCache": { "TSM": 235.50, "VRT": 225.10, "ETN": 345.00, "SPY": 602.30, "URA": 55.80 } }
```

**平日の各Heartbeat時:** 現在値と `weeklyCloseCache` を比較し、乖離率を算出。

```
乖離率 = (現在値 - 前週終値) / 前週終値 × 100
```

`levels`（-2%, -5%）のいずれかに到達した場合、通知:

```bash
osascript -e 'display notification "TSM $230.79（前週比 -2.0%）\n→ 指値水準到達。購入検討タイミング" with title "🎯 指値水準" sound name "Glass"'
```

同じ銘柄・同じレベルの通知は**1日1回まで**。

### B. 曜日戦略リマインド（weekdayBias）

```bash
date "+%u"
```

`preferredDays`（2=火曜, 4=木曜）に該当する場合、市場開始前の最初のHeartbeatで通知:

```bash
osascript -e 'display notification "📅 統計的安値日（火曜）\nURA / SPY の購入推奨タイミング\n※ 20EMA判定も確認" with title "📅 曜日戦略" sound name "Purr"'
```

### C. 20日EMA判定（ema20）

対象銘柄の20日分の価格データを取得し、20日EMAを算出する。

```bash
curl -s -A "$UA" "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=1mo" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
closes = d['chart']['result'][0]['indicators']['quote'][0]['close']
valid = [c for c in closes if c is not None]
if len(valid) < 20:
    print(json.dumps({'ema20': None, 'error': 'insufficient data'}))
    sys.exit()
k = 2 / (20 + 1)
ema = valid[0]
for price in valid[1:]:
    ema = price * k + ema * (1 - k)
current = valid[-1]
position = 'below' if current < ema else 'above'
gap_pct = round((current - ema) / ema * 100, 2)
print(json.dumps({'ticker': d['chart']['result'][0]['meta']['symbol'], 'ema20': round(ema, 2), 'price': current, 'position': position, 'gapPct': gap_pct}))
"
```

**判定ロジック:**
- 現在値 < 20EMA → `belowEma`（増額推奨: ×1.5）
- 現在値 ≥ 20EMA → `aboveEma`（減額推奨: ×0.7）

**通知（日次サマリーに含める + EMAクロス時に即時通知）:**

EMAを下抜けした瞬間（前回above → 今回below）:
```bash
osascript -e 'display notification "TSM $228.50 → 20EMA($235.20)割れ\n📉 増額購入推奨（×1.5）\nスポット買い: 注目ライン$333以下なら検討" with title "📊 20EMA下抜け" sound name "Submarine"'
```

EMAを上抜けした瞬間（前回below → 今回above）:
```bash
osascript -e 'display notification "TSM $237.00 → 20EMA($235.20)回復\n📈 通常量に戻す（×0.7）" with title "📊 20EMA上抜け" sound name "Glass"'
```

### D. スマートDCA結果の記録

判定結果を stock-history.json の `smartDca` フィールドに記録:

```json
{
  "smartDca": {
    "lastChecked": "2026-02-25T10:00:00+09:00",
    "ema20": {
      "TSM": { "ema": 235.20, "price": 228.50, "position": "below", "gapPct": -2.85 },
      "SPY": { "ema": 595.00, "price": 598.20, "position": "above", "gapPct": 0.54 }
    },
    "limitOrder": {
      "TSM": { "prevWeekClose": 235.50, "currentGapPct": -2.97, "triggered": [-2] }
    },
    "weekdayAlert": "火曜"
  }
}
```

---

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
- スマートDCA通知あり → `[Heartbeat] スマートDCA: {戦略名} {銘柄名} {詳細}`
- 何もなし → `HEARTBEAT_OK`

## 禁止事項

1. watchlist.jsonにない銘柄を勝手に追加しない
2. alertDown/alertUpの閾値を変更しない
3. 通知を英語で出さない
4. 売買判断・推奨を出さない — 事実とシグナルのみ通知
5. smart-dca-config.jsonの戦略設定を勝手に変更しない
6. EMA計算に十分なデータ（20日分）がない場合は判定をスキップする
